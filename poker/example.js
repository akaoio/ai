import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { runNeatGeneration } from "./neat.js"

const ecosystem = new Ecosystem({
    mutation: {
        bias: { change: [0, 0.5], max: 5, min: -5, rate: 0.05 },
        connection: { disable: 0.002, enable: 0.02, rate: 0.15 },
        node: 0.05,
        timestep: { change: [0, 1], max: 3, min: 0, rate: 0.05 },
        weight: { change: [0, 0.5], max: 5, min: -5, rate: 0.15 }
    },
    recurrent: true,
    size: 32,
    targetSpecies: 6
})

ecosystem.seed({ layers: [15, 0, 5], recurrentSteps: 2, type: "neat" })

const platform = new PokerPlatform({
    bigBlind: 10,
    handsPerTable: 5,
    replacement: true,
    smallBlind: 5,
    startingStack: 500,
    tableSize: 8
})

const result = runNeatGeneration(ecosystem, {
    generation: { hands: 5, tableSize: 8, tables: 16 },
    platform
})

console.table(result.standings.slice(0, 10))
