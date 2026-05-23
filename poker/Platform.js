import { Worker } from "worker_threads"
import { availableParallelism } from "os"
import { random } from "../Utils.js"
import PokerTable from "./Table.js"

const WORKER_URL = new URL("./table-worker.js", import.meta.url)
// Reserve 2 threads for OS + main; cap at 14 to avoid memory pressure
const NUM_WORKERS = Math.max(1, Math.min(availableParallelism() - 2, 14))

class PokerPlatform {
    constructor(config = {}) {
        this.tableSize = config.tableSize || 8
        this.handsPerTable = config.handsPerTable || 1
        this.startingStack = config.startingStack || 1000
        this.smallBlind = config.smallBlind || 5
        this.bigBlind = config.bigBlind || 10
        this.replacement = typeof config.replacement !== "undefined" ? config.replacement : true
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
        // Agents that bust early accumulate 0 chips for skipped rounds — natural punishment
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

            // Every alive agent starts this round with a FRESH stack — but if they bust, they're out
            const workerTables = tableAssignments.map(te => ({
                players: te.map(e => ({ ...this._agentSpec(e), stack: startingStack }))
            }))

            const numWorkers = Math.min(NUM_WORKERS, tableAssignments.length)
            const chunkSize = Math.ceil(tableAssignments.length / numWorkers)
            const chunks = []
            for (let i = 0; i < workerTables.length; i += chunkSize) chunks.push(workerTables.slice(i, i + chunkSize))

            const workerResults = await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
                const w = new Worker(WORKER_URL, { workerData: { networks: serializedNetworks, tables: chunk, config: tableConfig } })
                w.once("message", resolve)
                w.once("error", reject)
                w.once("exit", code => { if (code !== 0) reject(new Error(`Worker exited: ${code}`)) })
            })))

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
                        item.chipsWon += player.chipsWon  // round P&L accumulates
                        item.preflopFolds += player.preflopFolds || 0
                        // Bust this round → eliminated from all future rounds
                        if (player.stack === 0) alive.delete(player.id)
                    }
                }
            }
        }

        const standings = [...stats.values()].map(item => ({
            ...item,
            maxHands  // constant; busting early = missed positive earning rounds → naturally negative
        })).sort((a, b) => b.chipsWon - a.chipsWon)

        return { standings }
    }
}

export default PokerPlatform
