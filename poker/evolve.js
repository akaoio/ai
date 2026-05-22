import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { HeuristicAgent, OBSERVATION_SIZE } from "./agents.js"
import { runNeatGeneration } from "./neat.js"

const generations = Number(process.argv[2] || 25)
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
    size: 100,
    targetSpecies: 10
})

// 6 outputs: fold | check/call | raise-1/3pot | raise-2/3pot | raise-pot | all-in
ecosystem.seed({ layers: [OBSERVATION_SIZE, 16, 6], recurrentSteps: 2, type: "neat" })

const platform = new PokerPlatform({
    bigBlind: BIG_BLIND,
    handsPerTable: 20,
    replacement: true,
    smallBlind: BIG_BLIND / 2,
    startingStack: 500,
    tableSize: 8
})

// Baseline agents: 2 per style to occupy seats alongside NEAT genomes
const baseline = [
    { id: "heuristic-tight", createAgent: () => new HeuristicAgent({ id: "heuristic-tight", style: "tight" }) },
    { id: "heuristic-balanced", createAgent: () => new HeuristicAgent({ id: "heuristic-balanced", style: "balanced" }) },
    { id: "heuristic-aggressive", createAgent: () => new HeuristicAgent({ id: "heuristic-aggressive", style: "aggressive" }) },
    { id: "heuristic-loose", createAgent: () => new HeuristicAgent({ id: "heuristic-loose", style: "loose" }) }
]

console.log(`NEAT Poker — ${generations} generations | pop=${ecosystem.size} | obs=${OBSERVATION_SIZE} | outputs=6`)
console.log(`Platform: ${platform.tableSize} seats × ${platform.handsPerTable} hands | BB=${BIG_BLIND}`)
console.log("─".repeat(70))

for (let generation = 1; generation <= generations; generation++) {
    const result = await runNeatGeneration(ecosystem, {
        baseline,
        bigBlind: BIG_BLIND,
        checkpoint: { generation },
        generation: { hands: 20, tableSize: 8, tables: 100 },
        platform
    })

    const best = ecosystem.best()
    const avgFitness = ecosystem.averageFitness()
    const speciesCount = ecosystem.species?.length ?? 0
    const topStandings = result.standings.slice(0, 3)

    console.log(
        `Gen ${String(generation).padStart(3)} | ` +
        `best=${best?.fitness?.toFixed(2) ?? 0} BB/100 | ` +
        `avg=${avgFitness.toFixed(2)} | ` +
        `species=${speciesCount} | ` +
        `checkpoint=${result.checkpoint.file.split("/").pop()}`
    )
    if (generation % 5 === 0) {
        console.log("  Top genomes:", topStandings.map(s => `${s.id} (${s.chipsWon > 0 ? "+" : ""}${s.chipsWon})`).join(", "))
    }

    ecosystem.speciate()
    ecosystem.produce()
}

console.log("─".repeat(70))
console.log("Training complete.")
