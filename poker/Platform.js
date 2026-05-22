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
        const numTables = config.tables || Math.max(1, Math.ceil(entries.length / (config.tableSize || this.tableSize)))
        const standings = new Map(entries.map(entry => [entry.id, { allInRaises: 0, busts: 0, chipsWon: 0, hands: 0, handsActive: 0, id: entry.id, appearances: 0 }]))

        // Pre-generate all table seat assignments
        const guaranteed = config.guaranteed || []
        const tableAssignments = Array.from({ length: numTables }, () =>
            this.sampleEntrants(entries, config.tableSize || this.tableSize, guaranteed)
        )

        const neatEntries = entries.filter(e => e.network)

        if (neatEntries.length > 0) {
            // --- Parallel path: distribute tables across worker threads ---
            const serializedNetworks = neatEntries.map(e => ({ id: e.id, encoded: e.network.encode() }))
            const tableConfig = {
                bigBlind: config.bigBlind || this.bigBlind,
                button: 0,
                hands: config.hands || this.handsPerTable,
                smallBlind: config.smallBlind || this.smallBlind,
                startingStack: config.startingStack || this.startingStack
            }
            const workerTables = tableAssignments.map(te => ({ players: te.map(e => this._agentSpec(e)) }))

            // Chunk tables evenly across workers
            const numWorkers = Math.min(NUM_WORKERS, numTables)
            const chunkSize = Math.ceil(numTables / numWorkers)
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
                        const item = standings.get(player.id)
                        if (!item) continue
                        item.appearances++
                        item.allInRaises += player.allInRaises || 0
                        item.busts += player.busts || 0
                        item.chipsWon += player.chipsWon
                        item.hands += tableConfig.hands
                        item.handsActive += player.handsActive || 0
                    }
                }
            }
        } else {
            // --- Sequential fallback (no network entries) ---
            for (const tableEntries of tableAssignments) {
                const result = this.playTable(tableEntries, config)
                result.standings.forEach(player => {
                    const item = standings.get(player.id)
                    if (!item) return
                    item.appearances++
                    item.allInRaises += player.allInRaises || 0
                    item.busts += player.busts || 0
                    item.chipsWon += player.chipsWon
                    item.hands += config.hands || this.handsPerTable
                    item.handsActive += player.handsActive || 0
                })
            }
        }

        return {
            standings: [...standings.values()].sort((a, b) => b.chipsWon - a.chipsWon)
        }
    }
}

export default PokerPlatform
