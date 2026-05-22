import { random } from "../Utils.js"
import PokerTable from "./Table.js"

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

    runGeneration(entries = [], config = {}) {
        const tables = config.tables || Math.max(1, Math.ceil(entries.length / (config.tableSize || this.tableSize)))
        const standings = new Map(entries.map(entry => [entry.id, { chipsWon: 0, hands: 0, id: entry.id, appearances: 0 }]))
        const results = []

        for (let index = 0; index < tables; index++) {
            const guaranteed = config.guaranteed || []
            const tableEntries = this.sampleEntrants(entries, config.tableSize || this.tableSize, guaranteed)
            const result = this.playTable(tableEntries, config)
            results.push(result)
            result.standings.forEach(player => {
                const item = standings.get(player.id)
                item.appearances++
                item.chipsWon += player.chipsWon
                item.hands += config.hands || this.handsPerTable
            })
        }

        return {
            results,
            standings: [...standings.values()].sort((a, b) => b.chipsWon - a.chipsWon)
        }
    }
}

export default PokerPlatform
