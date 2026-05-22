// Worker thread: runs a batch of poker table simulations in parallel.
// Receives serialized networks + table specs via workerData, returns standings.
import { workerData, parentPort } from "worker_threads"

const { networks: serializedNetworks, tables, config } = workerData

const [{ default: Network }, { default: PokerTable }, agentsModule] = await Promise.all([
    import("../Network.js"),
    import("./Table.js"),
    import("./agents.js")
])

const { createNeatAgent, TightCallerAgent, HeuristicAgent } = agentsModule

// Decode all networks once — reused across all tables in this worker's batch
const networkMap = new Map(
    serializedNetworks.map(({ id, encoded }) => [id, new Network(encoded)])
)

function makeAgent({ id, type, style }) {
    if (type === "neat") {
        const net = networkMap.get(id)
        return net ? createNeatAgent(net) : new TightCallerAgent({ id })
    }
    if (type === "heuristic") return new HeuristicAgent({ id, style: style || "balanced" })
    return new TightCallerAgent({ id })
}

const results = tables.map(({ players }) => {
    const instances = players.map(spec => ({ id: spec.id, agent: makeAgent(spec) }))
    const table = new PokerTable({ ...config, players: instances })
    table.playHands(config.hands || 100)
    return table.standings()
})

parentPort.postMessage(results)
