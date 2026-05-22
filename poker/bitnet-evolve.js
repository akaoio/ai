import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { OBSERVATION_SIZE, TightCallerAgent, HeuristicAgent } from "./agents.js"
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
    targetSpecies: 10,
    minCompatibility: 0.01,
    compatibilityStep: 0.1
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
    startingStack: 2000,  // 200BB — enough cushion for persistent bankroll across rounds
    tableSize: 8
})

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
        bigBlind: BIG_BLIND,
        baseline: [
            { id: "tight-caller-1", createAgent: () => new TightCallerAgent({ id: "tight-caller-1" }) },
            { id: "tight-caller-2", createAgent: () => new TightCallerAgent({ id: "tight-caller-2" }) },
            { id: "heuristic-balanced", createAgent: () => new HeuristicAgent({ id: "heuristic-balanced", style: "balanced" }) },
            { id: "heuristic-aggressive", createAgent: () => new HeuristicAgent({ id: "heuristic-aggressive", style: "aggressive" }) }
        ],
        // Fitness = BB/100 (normalized by maxHands) - allIn penalty
        // Normalizing by maxHands (not actual hands) means busting early is punished naturally:
        // you lose chips AND miss earning from future rounds — no explicit bust penalty needed.
        fitness: (standing) => {
            if (!standing.maxHands || !standing.hands) return -1000
            // Divide by maxHands so surviving agents earn more fitness per chip won
            const bb100 = (standing.chipsWon / standing.maxHands) / BIG_BLIND * 100
            // allInRate over actual played hands (not maxHands) — reflects real behavior frequency
            const allInRate = (standing.allInRaises || 0) / standing.hands
            const allInPenalty = allInRate * BIG_BLIND * 800
            return bb100 - allInPenalty
        },
        checkpoint: { directory: CHECKPOINT_DIR, generation },
        generation: { hands: HANDS_PER_TABLE, rounds: 10, tableSize: 8, tables: 100 },
        platform
    })

    const best = ecosystem.best()
    if (!overallBest || (best?.fitness ?? -Infinity) > (overallBest.fitness ?? -Infinity)) {
        overallBest = ecosystem.clone(best)
        overallBest.fitness = best.fitness
    }

    ecosystem.speciate()

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
        const neatStandings = result.standings.filter(s => !s.id.startsWith("heuristic") && !s.id.startsWith("tight"))
        const avgAllInRate = neatStandings.length
            ? (neatStandings.reduce((sum, s) => sum + (s.allInRaises || 0) / Math.max(s.hands, 1), 0) / neatStandings.length * 100).toFixed(1)
            : "?"
        const survivalCount = neatStandings.filter(s => s.chipsWon > -platform.startingStack).length
        const survivalRate = neatStandings.length ? (survivalCount / neatStandings.length * 100).toFixed(0) : "?"
        const avgFinalStack = neatStandings.length
            ? (neatStandings.reduce((sum, s) => sum + s.chipsWon + platform.startingStack, 0) / neatStandings.length).toFixed(0)
            : "?"
        console.log(`  Top: ${topStandings.map(s => `${s.id}(${s.chipsWon > 0 ? "+" : ""}${s.chipsWon})`).join(", ")}`)
        console.log(`  Survived: ${survivalCount}/${neatStandings.length} (${survivalRate}%) | Avg final stack: ${avgFinalStack} | All-in rate avg: ${avgAllInRate}% | Elapsed: ${totalElapsed}min`)
    }

    ecosystem.produce()
}

console.log("─".repeat(70))
console.log(`Done! Best fitness: ${overallBest?.fitness?.toFixed(2)} BB/100`)
console.log(`Best network: ${overallBest?.neurons?.length} neurons, ${overallBest?.connections?.length} connections`)
console.log(`All weights ternary: ${overallBest?.connections?.every(c => [-1, 0, 1].includes(c.weight))}`)
