import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { HeuristicAgent, OBSERVATION_SIZE } from "./agents.js"
import { loadLatestCheckpoint, runNeatGeneration } from "./neat.js"

const generations = process.argv[2] ? Number(process.argv[2]) : Infinity
const BIG_BLIND = 10
const CHECKPOINT_DIR = "poker/checkpoints/bitnet"

const ecosystem = new Ecosystem({
    bitnet: true,
    mutation: {
        bias: { change: [0, 0.5], max: 5, min: -5, rate: 0.08 },
        connection: { disable: 0.001, enable: 0.02, rate: 0.3 },
        // No weight drift — BitNet flips to random ternary in mutate()
        weight: { rate: 0.2, change: [0, 1] },
        node: 0.15, // Higher node growth to reach thousands of neurons
        neuron: { rate: 0.005, max: 2000, enable: 0.02, disable: 0.001 },
        timestep: { change: [0, 1], max: 3, min: 0, rate: 0.03 }
    },
    recurrent: true,
    size: 100,
    targetSpecies: 10
})

// Resume from latest checkpoint, or seed fresh if none exists
const resumed = await loadLatestCheckpoint(CHECKPOINT_DIR, ecosystem)
let startGeneration = 1
if (resumed) {
    startGeneration = resumed.generation + 1
    console.log(`Resuming from ${resumed.file} (gen ${resumed.generation})`)
} else {
    // Seed: small topology so NEAT can grow toward thousands via mutations
    // 45 inputs → 16 hidden → 6 outputs (grows from here)
    ecosystem.seed({ layers: [OBSERVATION_SIZE, 16, 6], recurrentSteps: 2, type: "neat" })
    console.log(`Fresh start: ${OBSERVATION_SIZE}→16→6 | neurons=${ecosystem.population[0].neurons.length} | connections=${ecosystem.population[0].connections.length}`)
}

const HANDS_PER_TABLE = 100

const platform = new PokerPlatform({
    bigBlind: BIG_BLIND,
    handsPerTable: HANDS_PER_TABLE,
    replacement: true,
    smallBlind: BIG_BLIND / 2,
    startingStack: 500,
    tableSize: 8
})

const baseline = [
    { id: "heuristic-tight", createAgent: () => new HeuristicAgent({ id: "heuristic-tight", style: "tight" }) },
    { id: "heuristic-balanced", createAgent: () => new HeuristicAgent({ id: "heuristic-balanced", style: "balanced" }) },
    { id: "heuristic-aggressive", createAgent: () => new HeuristicAgent({ id: "heuristic-aggressive", style: "aggressive" }) },
    { id: "heuristic-loose", createAgent: () => new HeuristicAgent({ id: "heuristic-loose", style: "loose" }) }
]

const endGeneration = startGeneration + generations - 1
const rangeLabel = isFinite(endGeneration) ? `gen ${startGeneration}→${endGeneration}` : `gen ${startGeneration}→∞`
console.log(`BitNet NEAT Poker — ${rangeLabel} | pop=${ecosystem.size}`)
console.log(`Platform: ${platform.tableSize} seats × ${HANDS_PER_TABLE} hands/table | BB=${BIG_BLIND}`)
console.log("─".repeat(70))

const t0 = Date.now()
let overallBest = null

for (let generation = startGeneration; generation <= endGeneration; generation++) {
    const tGen = Date.now()

    let result
    result = await runNeatGeneration(ecosystem, {
        baseline,
        bigBlind: BIG_BLIND,
        checkpoint: { directory: CHECKPOINT_DIR, generation },
        generation: { hands: HANDS_PER_TABLE, tableSize: 8, tables: 100 },
        platform
    })

    const best = ecosystem.best()
    if (!overallBest || (best?.fitness ?? -Infinity) > (overallBest.fitness ?? -Infinity)) {
        overallBest = ecosystem.clone(best)
        overallBest.fitness = best.fitness
    }

    const avgFitness = ecosystem.averageFitness()
    const speciesCount = ecosystem.species?.length ?? 0
    const totalNeurons = ecosystem.population.reduce((s, n) => s + n.neurons.length, 0)
    const avgNeurons = Math.round(totalNeurons / ecosystem.population.length)
    const maxNeurons = Math.max(...ecosystem.population.map(n => n.neurons.length))
    const elapsed = ((Date.now() - tGen) / 1000).toFixed(1)

    console.log(
        `Gen ${String(generation).padStart(3)} | ` +
        `best=${best?.fitness?.toFixed(2) ?? 0} BB/100 | ` +
        `avg=${avgFitness.toFixed(2)} | ` +
        `species=${speciesCount} | ` +
        `neurons avg=${avgNeurons} max=${maxNeurons} | ` +
        `${elapsed}s`
    )

    if (generation % 5 === 0) {
        const topStandings = result.standings.slice(0, 3)
        const totalElapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1)
        console.log(`  Top: ${topStandings.map(s => `${s.id}(${s.chipsWon > 0 ? "+" : ""}${s.chipsWon})`).join(", ")}`)
        console.log(`  Total elapsed: ${totalElapsed}min`)
    }

    ecosystem.speciate()
    ecosystem.produce()
}

console.log("─".repeat(70))
console.log(`Done! Best fitness: ${overallBest?.fitness?.toFixed(2)} BB/100`)
console.log(`Best network: ${overallBest?.neurons?.length} neurons, ${overallBest?.connections?.length} connections`)
console.log(`All weights ternary: ${overallBest?.connections?.every(c => [-1, 0, 1].includes(c.weight))}`)
