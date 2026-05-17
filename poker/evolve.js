import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { OBSERVATION_SIZE } from "./agents.js"
import { runNeatGeneration } from "./neat.js"

const generations = Number(process.argv[2] || 25)

const ecosystem = new Ecosystem({
    mutation: {
        bias: { change: [0, 0.5], max: 5, min: -5, rate: 0.05 },
        connection: { disable: 0.002, enable: 0.02, rate: 0.15 },
        node: 0.05,
        timestep: { change: [0, 1], max: 3, min: 0, rate: 0.05 },
        weight: { change: [0, 0.5], max: 5, min: -5, rate: 0.15 }
    },
    recurrent: true,
    size: 100,
    targetSpecies: 10
})

ecosystem.seed({ layers: [OBSERVATION_SIZE, 0, 5], recurrentSteps: 2, type: "neat" })

const platform = new PokerPlatform({
    bigBlind: 10,
    handsPerTable: 20,
    replacement: true,
    smallBlind: 5,
    startingStack: 500,
    tableSize: 8
})

for (let generation = 1; generation <= generations; generation++) {
    const result = await runNeatGeneration(ecosystem, {
        checkpoint: { generation },
        generation: { hands: 20, tableSize: 8, tables: 100 },
        platform
    })
    const best = ecosystem.best()
    console.log({
        bestFitness: best?.fitness ?? 0,
        bestScore: best?.score ?? 0,
        checkpoint: result.checkpoint.file,
        generation
    })
    ecosystem.speciate()
    ecosystem.produce()
}
