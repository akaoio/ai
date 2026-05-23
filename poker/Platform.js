import { Worker } from "worker_threads"
import { availableParallelism } from "os"
import { random } from "../Utils.js"
import PokerTable from "./Table.js"

const WORKER_URL = new URL("./table-worker.js", import.meta.url)
// Reserve 2 threads for OS + main; cap at 14 to avoid memory pressure
const NUM_WORKERS = Math.max(1, Math.min(availableParallelism() - 2, 14))

let _nextMsgId = 0

class PokerPlatform {
    constructor(config = {}) {
        this.tableSize = config.tableSize || 8
        this.handsPerTable = config.handsPerTable || 1
        this.startingStack = config.startingStack || 1000
        this.smallBlind = config.smallBlind || 5
        this.bigBlind = config.bigBlind || 10
        this.replacement = typeof config.replacement !== "undefined" ? config.replacement : true
    }

    // Send a request to a worker and resolve with its response.
    // Uses a message id so concurrent sends to different workers stay unambiguous.
    _send(worker, payload) {
        const id = ++_nextMsgId
        return new Promise((resolve, reject) => {
            const onMsg = (msg) => {
                if (msg.id !== id) return
                worker.off("message", onMsg)
                worker.off("error", onErr)
                if (msg.error) reject(new Error(msg.error))
                else resolve(msg.data)
            }
            const onErr = (err) => {
                worker.off("message", onMsg)
                worker.off("error", onErr)
                reject(err)
            }
            worker.on("message", onMsg)
            worker.on("error", onErr)
            worker.postMessage({ ...payload, id })
        })
    }

    instantiate(entry) {
        const agent = typeof entry.createAgent === "function" ? entry.createAgent() : entry.agent
        return { agent, id: entry.id }
    }

    sampleEntrants(entries = [], tableSize = this.tableSize, guaranteed = []) {
        // guaranteed entries always appear at every table (e.g. baseline agents for honest benchmarking)
        const pool = [...entries]
        const sampled = [...guaranteed]
        while (sampled.length < tableSize && pool.length) {
            const entrant = random(pool)
            sampled.push(entrant)
            if (!this.replacement) pool.splice(pool.indexOf(entrant), 1)
        }
        return sampled
    }

    // Returns the agent spec needed to reconstruct the agent inside a worker thread.
    _agentSpec(entry) {
        if (entry.network) return { id: entry.id, type: "neat" }
        const id = entry.id
        if (id.includes("aggressive")) return { id, type: "heuristic", style: "aggressive" }
        if (id.includes("heuristic")) return { id, type: "heuristic", style: "balanced" }
        return { id, type: "tight-caller" }
    }

    playTable(entries = [], config = {}) {
        const table = new PokerTable({
            bigBlind: config.bigBlind || this.bigBlind,
            button: config.button || 0,
            players: entries.map(entry => this.instantiate(entry)),
            smallBlind: config.smallBlind || this.smallBlind,
            startingStack: config.startingStack || this.startingStack
        })
        const history = table.playHands(config.hands || this.handsPerTable, config)
        return { history, standings: table.standings() }
    }

    async runGeneration(entries = [], config = {}) {
        const numTables = config.tables || 100
        const tableSize = config.tableSize || this.tableSize
        const handsPerTable = config.hands || this.handsPerTable
        const startingStack = config.startingStack || this.startingStack
        const numRounds = config.rounds || 10
        const tablesPerRound = Math.ceil(numTables / numRounds)

        // maxHands: total hands an agent can play if it never busts (used for fitness normalization)
        const maxHands = numRounds * handsPerTable

        const neatEntries = entries.filter(e => e.network)
        const serializedNetworks = neatEntries.map(e => ({ id: e.id, encoded: e.network.encode() }))
        const tableConfig = {
            bigBlind: config.bigBlind || this.bigBlind,
            button: 0,
            hands: handsPerTable,
            smallBlind: config.smallBlind || this.smallBlind,
            startingStack
        }

        // Spawn workers once per generation — reused across all rounds, terminated after.
        // Old design: NEW worker per round chunk (8 rounds × 3 workers = 24 spawns/gen).
        // New design: 3 spawns/gen. Workers buffer the "load" message during their async
        // startup and process it once their listener is registered — no race condition.
        const numWorkers = Math.min(NUM_WORKERS, Math.max(1, tablesPerRound))
        const workers = Array.from({ length: numWorkers }, () => new Worker(WORKER_URL))

        try {
            await Promise.all(workers.map(w => this._send(w, { type: "load", networks: serializedNetworks })))

            // alive tracks who can still play — bust in any round = eliminated from future rounds
            const alive = new Set(entries.map(e => e.id))
            const stats = new Map(entries.map(e => [e.id, { allInRaises: 0, busts: 0, chipsWon: 0, hands: 0, handsActive: 0, id: e.id, appearances: 0, preflopFolds: 0 }]))

            for (let round = 0; round < numRounds; round++) {
                const aliveEntries = entries.filter(e => alive.has(e.id))
                if (aliveEntries.length < 2) break

                // Shuffle alive agents and assign to tables — each agent at most once per round
                const shuffled = [...aliveEntries].sort(() => Math.random() - 0.5)
                const tableAssignments = []
                for (let i = 0; i < shuffled.length && tableAssignments.length < tablesPerRound; i += tableSize) {
                    const players = shuffled.slice(i, i + tableSize)
                    if (players.length >= 2) tableAssignments.push(players)
                }
                if (!tableAssignments.length) break

                const workerTables = tableAssignments.map(te => ({
                    players: te.map(e => ({ ...this._agentSpec(e), stack: startingStack }))
                }))

                // Distribute table chunks across the generation's worker pool
                const numChunks = Math.min(workers.length, workerTables.length)
                const chunkSize = Math.ceil(workerTables.length / numChunks)
                const chunks = []
                for (let i = 0; i < workerTables.length; i += chunkSize) chunks.push(workerTables.slice(i, i + chunkSize))

                const workerResults = await Promise.all(
                    chunks.map((chunk, i) => this._send(workers[i], { type: "run", tables: chunk, config: tableConfig }))
                )

                for (const chunkResult of workerResults) {
                    for (const tableStandings of chunkResult) {
                        for (const player of tableStandings) {
                            const item = stats.get(player.id)
                            if (!item) continue
                            item.appearances++
                            item.allInRaises += player.allInRaises || 0
                            item.busts += player.busts || 0
                            item.hands += handsPerTable
                            item.handsActive += player.handsActive || 0
                            item.chipsWon += player.chipsWon
                            item.preflopFolds += player.preflopFolds || 0
                            if (player.stack === 0) alive.delete(player.id)
                        }
                    }
                }
            }

            const standings = [...stats.values()].map(item => ({
                ...item,
                maxHands
            })).sort((a, b) => b.chipsWon - a.chipsWon)

            return { standings }
        } finally {
            // Always terminate workers — keeps tests clean and prevents resource leaks
            workers.forEach(w => w.terminate())
        }
    }
}

export default PokerPlatform
