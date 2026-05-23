import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { OBSERVATION_SIZE, TightCallerAgent, HeuristicAgent } from "./agents.js"
import { loadLatestCheckpoint, runNeatGeneration } from "./neat.js"

const generations = process.argv[2] ? Number(process.argv[2]) : Infinity
const BIG_BLIND = 10
const CHECKPOINT_DIR = "poker/checkpoints/bitnet"
const TARGET_NEURONS = 10000

const ecosystem = new Ecosystem({
    bitnet: true,
    mutation: {
        bias: { change: [0, 0.5], max: 5, min: -5, rate: 0.08 },
        // addConnection is O(neurons²) — prohibitive at 10k neurons.
        // New connections grow via node-splits (node mutation) instead.
        connection: { disable: 0.001, enable: 0.02, rate: 0 },
        weight: { rate: 0.3, change: [0, 1] },
        node: 0.05,
        neuron: { rate: 0.005, max: 6000, enable: 0.02, disable: 0.001 },
        timestep: { change: [0, 1], max: 3, min: 0, rate: 0.01 }
    },
    recurrent: true,
    size: 20,
    targetSpecies: 4,
    minCompatibility: 0.01,
    compatibilityStep: 0.1
})

// Resume from latest checkpoint, or pre-grow a fresh 10k-neuron sparse template
const resumed = await loadLatestCheckpoint(CHECKPOINT_DIR, ecosystem)
let startGeneration = 1
if (resumed) {
    startGeneration = resumed.generation + 1
    console.log(`Resuming from ${resumed.file} (gen ${resumed.generation})`)
} else {
    // Phase 1: minimal seed
    ecosystem.seed({ layers: [OBSERVATION_SIZE, 16, 6], recurrentSteps: 2, type: "neat" })
    const template = ecosystem.population[0]
    const n0 = template.neurons.length  // ~71
    const splitsNeeded = TARGET_NEURONS - n0

    // Phase 2: grow template to TARGET_NEURONS via node-splits.
    // Each split: disables 1 feedforward connection, adds 1 neuron + 2 connections (net +1 conn).
    // After splitsNeeded splits: n0+splitsNeeded neurons, n0+splitsNeeded active connections.
    process.stdout.write(`Pre-growing ${n0} → ${TARGET_NEURONS} neurons (${splitsNeeded} node-splits)`)
    for (let i = 0; i < splitsNeeded; i++) {
        ecosystem.mutateAddNode(template)
        if ((i + 1) % 500 === 0) process.stdout.write(` ${n0 + i + 1}`)
    }
    process.stdout.write("\n")

    const finalNeurons = template.neurons.length
    const finalConnections = template.connections.filter(c => c.s).length
    console.log(
        `Template: ${finalNeurons} neurons | ${finalConnections} active connections ` +
        `| sparsity: ${(finalConnections / finalNeurons).toFixed(2)} conn/neuron`
    )

    // Phase 3: clone template to rest of population, re-randomize weights for diversity
    for (let i = 1; i < ecosystem.size; i++) {
        const clone = ecosystem.clone(template)
        clone.connections.forEach(c => {
            if (c.s) c.weight = [-1, 0, 1][Math.floor(Math.random() * 3)]
        })
        ecosystem.population[i] = clone
    }

    console.log(`Population seeded: ${ecosystem.size} genomes @ ${finalNeurons} neurons each`)
}

const HANDS_PER_TABLE = 100
const TABLES = 20
const ROUNDS = 8

const platform = new PokerPlatform({
    bigBlind: BIG_BLIND,
    handsPerTable: HANDS_PER_TABLE,
    replacement: true,
    smallBlind: BIG_BLIND / 2,
    startingStack: 2000,
    tableSize: 8
})

const endGeneration = startGeneration + generations - 1
const rangeLabel = isFinite(endGeneration) ? `gen ${startGeneration}→${endGeneration}` : `gen ${startGeneration}→∞`
console.log(`BitNet NEAT Poker — ${rangeLabel} | pop=${ecosystem.size} | target=${TARGET_NEURONS} neurons`)
console.log(`Platform: ${platform.tableSize} seats × ${HANDS_PER_TABLE} hands/table × ${ROUNDS} rounds = ${HANDS_PER_TABLE * ROUNDS} hands/genome | BB=${BIG_BLIND}`)
console.log("─".repeat(70))

const t0 = Date.now()
let overallBest = null

for (let generation = startGeneration; generation <= endGeneration; generation++) {
    const tGen = Date.now()

    const result = await runNeatGeneration(ecosystem, {
        bigBlind: BIG_BLIND,
        fitnessSmoothing: 0.25,
        baseline: [
            { id: "tight-caller-1", createAgent: () => new TightCallerAgent({ id: "tight-caller-1" }) },
            { id: "tight-caller-2", createAgent: () => new TightCallerAgent({ id: "tight-caller-2" }) },
            { id: "heuristic-balanced", createAgent: () => new HeuristicAgent({ id: "heuristic-balanced", style: "balanced" }) },
            { id: "heuristic-aggressive", createAgent: () => new HeuristicAgent({ id: "heuristic-aggressive", style: "aggressive" }) }
        ],
        fitness: (standing) => {
            if (!standing.maxHands || !standing.hands) return -1000
            const bb100 = (standing.chipsWon / standing.maxHands) / BIG_BLIND * 100
            const allInRate = (standing.allInRaises || 0) / standing.hands
            const allInPenalty = allInRate * BIG_BLIND * 800
            return bb100 - allInPenalty
        },
        checkpoint: { directory: CHECKPOINT_DIR, generation },
        generation: { hands: HANDS_PER_TABLE, rounds: ROUNDS, tableSize: 8, tables: TABLES },
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
        `peak=${overallBest?.fitness?.toFixed(2) ?? 0} BB/100 | ` +
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
