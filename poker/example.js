import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { HeuristicAgent, OBSERVATION_SIZE } from "./agents.js"
import { runNeatGeneration } from "./neat.js"

const BIG_BLIND = 10

const ecosystem = new Ecosystem({
    mutation: {
        bias: { change: [0, 0.3], max: 4, min: -4, rate: 0.06 },
        connection: { disable: 0.002, enable: 0.02, rate: 0.15 },
        node: 0.04,
        timestep: { change: [0, 1], max: 3, min: 0, rate: 0.04 },
        weight: { change: [0, 0.3], max: 4, min: -4, rate: 0.15 }
    },
    recurrent: true,
    size: 32,
    targetSpecies: 6
})

ecosystem.seed({ layers: [OBSERVATION_SIZE, 16, 6], recurrentSteps: 2, type: "neat" })

const platform = new PokerPlatform({
    bigBlind: BIG_BLIND,
    handsPerTable: 5,
    replacement: true,
    smallBlind: BIG_BLIND / 2,
    startingStack: 500,
    tableSize: 8
})

const baseline = [
    { id: "heuristic-tight", createAgent: () => new HeuristicAgent({ id: "heuristic-tight", style: "tight" }) },
    { id: "heuristic-balanced", createAgent: () => new HeuristicAgent({ id: "heuristic-balanced", style: "balanced" }) }
]

for (let generation = 1; generation <= 10; generation++) {
    const result = await runNeatGeneration(ecosystem, {
        baseline,
        bigBlind: BIG_BLIND,
        checkpoint: { generation },
        generation: { hands: 5, tableSize: 8, tables: 16 },
        platform
    })
    const best = ecosystem.best()
    console.log(`generation ${generation}: best=${best?.fitness?.toFixed(2) ?? 0} BB/100 | ${result.checkpoint.file}`)
    console.table(result.standings.slice(0, 5))
    ecosystem.speciate()
    ecosystem.produce()
}
