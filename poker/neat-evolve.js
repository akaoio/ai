import Ecosystem from "../Ecosystem.js"
import PokerPlatform from "./Platform.js"
import { HeuristicAgent, TightCallerAgent, OBSERVATION_SIZE } from "./agents.js"
import { loadLatestCheckpoint, runNeatGeneration } from "./neat.js"

const generations = process.argv[2] ? Number(process.argv[2]) : Infinity
const BIG_BLIND = 10
const CHECKPOINT_DIR = "poker/checkpoints/neat"

// ── Ecosystem ──────────────────────────────────────────────────────────────
// Pop=150 gives enough diversity for NEAT speciation to work.
// Small seed network (32 hidden) — NEAT can grow it organically.
const ecosystem = new Ecosystem({
    mutation: {
        bias:       { change: [0, 0.3], max: 4,  min: -4, rate: 0.06 },
        connection: { disable: 0.005,  enable: 0.02,      rate: 0.12 },
        node:       0.03,
        neuron:     { max: 512 },   // cap growth — prevents unbounded bloat
        timestep:   { change: [0, 1],  max: 3,  min: 0,   rate: 0.02 },
        weight:     { change: [0, 0.3], max: 4, min: -4,  rate: 0.20 }
    },
    // Speciation tuned for large networks (1760 connections).
    // Distance is normalized by connection count so values are tiny (~0.01–0.15).
    // Default compatibility=3 / minCompatibility=0.5 would never split a 1760-conn network.
    // wdc boosted 0.5→2 so weight divergence registers at a useful scale.
    compatibility:      0.4,   // start low; adaptive mechanism tunes it each gen
    compatibilityStep:  0.05,  // fine-grained steps for small-scale distances
    minCompatibility:   0.1,   // floor — prevents splitting on noise
    wdc:                2.0,   // weight difference coefficient (default 0.5 is too weak)
    elitism:      0.05,
    recurrent:    true,
    size:         150,
    stagnation:   20,
    survivalRate: 0.40,
    targetSpecies: 8
})

// Resume from an existing checkpoint if present, otherwise seed fresh
const resumed = await loadLatestCheckpoint(CHECKPOINT_DIR, ecosystem)
let startGeneration = 1
if (resumed) {
    startGeneration = resumed.generation + 1
    console.log(`Resuming from ${resumed.file} (gen ${resumed.generation})`)
} else {
    // Seed: 49 inputs → 32 hidden → 6 outputs (fold|check-call|raise×3|all-in)
    ecosystem.seed({ layers: [OBSERVATION_SIZE, 32, 6], recurrentSteps: 2, type: "neat" })
}

// ── Evaluation setup ────────────────────────────────────────────────────────
// 6 seats, 20 rounds, 300 hands/table → ~6000 hands/genome per generation.
// (pop=150 + 4 baselines = 154 agents → ceil(154/6)=26 tables/round)
// At 14 workers × 2 batches/round × 20 rounds ≈ 40 batch dispatches per gen.
const HANDS_PER_TABLE = 300
const TABLE_SIZE      = 6
const ROUNDS          = 20
// tables param is used only to derive tablesPerRound = ceil(tables/rounds)
// We set it to 26*ROUNDS so tablesPerRound=26 (matches actual agent count)
const NUM_AGENTS      = ecosystem.size + 4  // 4 baselines
const TABLES_PER_ROUND = Math.ceil(NUM_AGENTS / TABLE_SIZE)
const TABLES          = TABLES_PER_ROUND * ROUNDS  // 520

const platform = new PokerPlatform({
    bigBlind:      BIG_BLIND,
    handsPerTable: HANDS_PER_TABLE,
    replacement:   true,
    smallBlind:    BIG_BLIND / 2,
    startingStack: 1500,    // 150 BB — enough depth to allow multiple streets
    tableSize:     TABLE_SIZE
})

// Baselines: one of each style so the fitness signal covers a range of opponents
const baseline = [
    { id: "heuristic-tight",      createAgent: () => new HeuristicAgent({ id: "heuristic-tight",      style: "tight"      }) },
    { id: "heuristic-balanced",   createAgent: () => new HeuristicAgent({ id: "heuristic-balanced",   style: "balanced"   }) },
    { id: "heuristic-aggressive", createAgent: () => new HeuristicAgent({ id: "heuristic-aggressive", style: "aggressive" }) },
    { id: "heuristic-loose",      createAgent: () => new HeuristicAgent({ id: "heuristic-loose",      style: "loose"      }) }
]

const endGeneration = isFinite(generations) ? startGeneration + generations - 1 : Infinity
const rangeLabel = isFinite(endGeneration)
    ? `gen ${startGeneration}→${endGeneration}`
    : `gen ${startGeneration}→∞`

console.log(`NEAT Poker (v2) — ${rangeLabel}`)
console.log(`Pop: ${ecosystem.size} | seed: [${OBSERVATION_SIZE}→32→6] | obs=${OBSERVATION_SIZE}`)
console.log(`Eval: ${TABLE_SIZE}-seat tables × ${HANDS_PER_TABLE} hands × ${ROUNDS} rounds = ~${HANDS_PER_TABLE * ROUNDS} hands/genome`)
console.log(`BB=${BIG_BLIND} | stack=${platform.startingStack} (${platform.startingStack / BIG_BLIND} BB)`)
console.log("─".repeat(72))

const t0 = Date.now()
let overallBest = null

for (let generation = startGeneration; generation <= endGeneration; generation++) {
    const tGen = Date.now()

    const result = await runNeatGeneration(ecosystem, {
        bigBlind: BIG_BLIND,
        // Normalize by maxHands (total hands genome COULD have played if it never busted).
        // Using standing.hands inflates BB/100 for early-busting genomes that happened to win
        // a few big pots — e.g. 21000 chips / 900 hands = 233 BB/100 vs 35 BB/100 at 6000 hands.
        fitness: (standing) => {
            if (!standing.maxHands) return -1000
            return (standing.chipsWon / standing.maxHands) / BIG_BLIND * 100
        },
        // EMA smoothing: blend 40% new measurement + 60% history.
        fitnessSmoothing: 0.40,
        baseline,
        checkpoint: { directory: CHECKPOINT_DIR, generation },
        generation: {
            hands:     HANDS_PER_TABLE,
            rounds:    ROUNDS,
            tableSize: TABLE_SIZE,
            tables:    TABLES
        },
        platform
    })

    const best = ecosystem.best()
    if (!overallBest || (best?.fitness ?? -Infinity) > (overallBest.fitness ?? -Infinity)) {
        overallBest = ecosystem.clone(best)
        overallBest.fitness = best.fitness
    }

    ecosystem.speciate()

    const avgFitness    = ecosystem.averageFitness()
    const speciesCount  = ecosystem.species?.length ?? 0
    const avgNeurons    = Math.round(
        ecosystem.population.reduce((s, n) => s + (n.neurons?.length ?? 0), 0) / ecosystem.population.length
    )
    const maxNeurons    = Math.max(...ecosystem.population.map(n => n.neurons?.length ?? 0))
    const elapsed       = ((Date.now() - tGen) / 1000).toFixed(1)

    console.log(
        `Gen ${String(generation).padStart(4)} | ` +
        `best=${best?.fitness?.toFixed(2) ?? "0.00"} BB/100 | ` +
        `peak=${overallBest?.fitness?.toFixed(2) ?? "0.00"} BB/100 | ` +
        `avg=${avgFitness.toFixed(2)} | ` +
        `species=${speciesCount} | ` +
        `neurons avg=${avgNeurons} max=${maxNeurons} | ` +
        `${elapsed}s`
    )

    if (generation % 5 === 0) {
        const topStandings   = result.standings.slice(0, 3)
        const neatStandings  = result.standings.filter(s => s.id.startsWith("genome"))
        const totalElapsed   = ((Date.now() - t0) / 1000 / 60).toFixed(1)
        const avgAllInRate   = neatStandings.length
            ? (neatStandings.reduce((sum, s) => sum + (s.allInRaises || 0) / Math.max(s.hands, 1), 0)
               / neatStandings.length * 100).toFixed(1)
            : "?"
        const survivalCount  = neatStandings.filter(s => s.chipsWon > -platform.startingStack).length
        const survivalRate   = neatStandings.length
            ? (survivalCount / neatStandings.length * 100).toFixed(0) : "?"
        const avgFinalStack  = neatStandings.length
            ? Math.round(neatStandings.reduce((s, p) => s + p.chipsWon + platform.startingStack, 0) / neatStandings.length)
            : "?"

        // Species health
        const stagnantSummary = (ecosystem.species || [])
            .map(sp => `sp${sp.id}(sz=${sp.length},stag=${sp.stagnant ?? 0})`)
            .join(" ")

        console.log(`  Top: ${topStandings.map(s => `${s.id}(${s.chipsWon > 0 ? "+" : ""}${s.chipsWon})`).join(", ")}`)
        console.log(`  Survived: ${survivalCount}/${neatStandings.length} (${survivalRate}%) | Avg stack: ${avgFinalStack} | All-in rate: ${avgAllInRate}% | Elapsed: ${totalElapsed}min`)
        console.log(`  Species: ${stagnantSummary}`)
    }

    ecosystem.produce()
}

console.log("─".repeat(72))
console.log(`Done! Peak fitness: ${overallBest?.fitness?.toFixed(2)} BB/100`)
console.log(`Best network: ${overallBest?.neurons?.length} neurons, ${overallBest?.connections?.length} connections`)
