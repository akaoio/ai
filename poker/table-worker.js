// Persistent worker thread — stays alive across rounds and generations.
// Protocol: receive { type: "load"|"run", id, ... }, reply with { id, data?, error? }.
import { parentPort } from "worker_threads"

const [{ default: Network }, { default: PokerTable }, agentsModule, { loadWasmKernels }] = await Promise.all([
    import("../Network.js"),
    import("./Table.js"),
    import("./agents.js"),
    import("../Wasm.js"),
])

const { createNeatAgent, TightCallerAgent, HeuristicAgent } = agentsModule

// Initialize WASM once — persists for the lifetime of this worker
const wasm = await loadWasmKernels()
let networkMap = new Map()

function makeAgent({ id, type, style }) {
    if (type === "neat") {
        const net = networkMap.get(id)
        return net ? createNeatAgent(net) : new TightCallerAgent({ id })
    }
    if (type === "heuristic") return new HeuristicAgent({ id, style: style || "balanced" })
    return new TightCallerAgent({ id })
}

parentPort.on("message", ({ id, type, networks, tables, config }) => {
    try {
        if (type === "load") {
            // Decode and WASM-compile all networks for this generation (once per gen, not per round)
            networkMap = new Map(
                networks.map(({ id: netId, encoded }) => {
                    const net = new Network(encoded)
                    net.compile(wasm)
                    return [netId, net]
                })
            )
            parentPort.postMessage({ id })
        } else if (type === "run") {
            const results = tables.map(({ players }) => {
                const instances = players.map(spec => ({ id: spec.id, agent: makeAgent(spec), stack: spec.stack }))
                const table = new PokerTable({ ...config, players: instances })
                table.playHands(config.hands || 100)
                return table.standings()
            })
            parentPort.postMessage({ id, data: results })
        }
    } catch (e) {
        parentPort.postMessage({ id, error: e.message })
    }
})
