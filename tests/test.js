import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import Ecosystem from "../Ecosystem.js"
import Network from "../Network.js"
import PokerPlatform from "../poker/Platform.js"
import PokerTable from "../poker/Table.js"
import { OBSERVATION_SIZE, ScriptedAgent, encodeObservation, preflopHandBucket } from "../poker/agents.js"
import { compareRanks, evaluateFive, evaluateSeven } from "../poker/evaluator.js"
import { runNeatGeneration, assignFitnessFromStandings, serializeCheckpoint } from "../poker/neat.js"
import { setSeed } from "../Utils.js"
import { XOR } from "./exams.js"

import { quantize } from "../Utils.js"

const train = (data, config = {}) => {
    setSeed(42)
    const network = new Network({ layers: [2, 0, 10, 0, 1], ...config })
    for (let i = 0; i < 60000; i++) {
        const item = data[i % data.length]
        network.train(item.input, item.output)
    }
    return network
}

const classify = (network, data) => data.map(item => Math.round(network.calculate(item.input)[0]))

const scoreXorPopulation = ecosystem => {
    ecosystem.population.forEach(creature => {
        const error = XOR.map(item => Math.pow(item.output[0] - creature.calculate(item.input)[0], 2)).reduce((value, item) => value + item, 0)
        creature.error = error
        creature.fitness = XOR.length - error
    })
}

test("feedforward networks solve XOR with sigmoid", () => {
    const network = train(XOR)
    assert.deepEqual(
        classify(network, XOR),
        XOR.map(item => item.output[0])
    )
})

test("encode/decode preserves trained outputs", () => {
    const network = train(XOR, { layers: [2, 0, { neurons: 4, activator: "sigmoid" }, 0, { neurons: 4, activator: "relu" }, 1] })
    const encoded = network.encode()
    const clone = new Network(encoded)
    assert.deepEqual(
        classify(clone, XOR),
        XOR.map(item => item.output[0])
    )
})

test("seeded genomes share canonical innovation numbers", () => {
    setSeed(3)
    const ecosystem = new Ecosystem({ size: 3 })
    ecosystem.seed({ layers: [2, 0, 1] })
    const innovations = ecosystem.population.map(individual => individual.connections.map(connection => connection.innovation))
    assert.deepEqual(innovations[0], innovations[1])
    assert.deepEqual(innovations[1], innovations[2])
    assert.deepEqual(ecosystem.population[0].neurons.map(neuron => neuron.kind), ["input", "input", "output"])
})

test("splitting the same historical connection reuses node and connection innovations", () => {
    setSeed(9)
    const ecosystem = new Ecosystem({ size: 2 })
    ecosystem.seed({ layers: [1, 0, 1] })
    const [first, second] = ecosystem.population

    ecosystem.mutateAddNode(first)
    ecosystem.mutateAddNode(second)

    const hiddenA = first.neurons.find(neuron => neuron.kind === "hidden")
    const hiddenB = second.neurons.find(neuron => neuron.kind === "hidden")
    assert.ok(hiddenA)
    assert.ok(hiddenB)
    assert.equal(hiddenA.id, hiddenB.id)
    assert.deepEqual(
        first.connections.map(connection => connection.innovation).sort((a, b) => a - b),
        second.connections.map(connection => connection.innovation).sort((a, b) => a - b)
    )
})

test("crossover aligns genes by innovation and keeps fitter parent structure", () => {
    setSeed(11)
    const ecosystem = new Ecosystem({ size: 2 })
    ecosystem.seed({ layers: [1, 0, 1] })
    const [fitter, weaker] = ecosystem.population
    ecosystem.mutateAddNode(fitter)
    fitter.fitness = 10
    weaker.fitness = 1

    const child = ecosystem.crossover(fitter, weaker)
    assert.ok(child.neurons.some(neuron => neuron.kind === "hidden"))
    assert.ok(child.connections.every(connection => !isNaN(connection.innovation)))
    assert.ok(child.connections.some(connection => connection.innovation === fitter.connections[fitter.connections.length - 1].innovation))
})

test("recurrent connections preserve delayed state across steps", () => {
    const network = new Network({
        activator: false,
        layers: [{ neurons: 1, activator: false }, { neurons: 1, activator: false }]
    })
    const input = network.layers[0].n[0]
    const output = network.layers[1].n[0]
    network.connections = []
    input.inputs = []
    input.outputs = []
    output.inputs = []
    output.outputs = []
    input.bias = 0
    output.bias = 0
    input.activator = false
    output.activator = false
    network.connect({ from: input, timestep: 0, to: output, weight: 1 })
    network.connect({ from: output, timestep: 1, to: output, weight: 1 })

    assert.deepEqual(network.calculate([1], { steps: 1 }), [1])
    assert.deepEqual(network.step([0]), [1])
    assert.deepEqual(network.step([0]), [1])
})

test("recurrent ecosystem mutations can add backward or self connections", () => {
    setSeed(17)
    const ecosystem = new Ecosystem({ recurrent: true, size: 1 })
    ecosystem.seed({ layers: [1, 1, 1] })
    const network = ecosystem.population[0]
    ecosystem.connectGene(network, network.layers[2].n[0], network.layers[1].n[0], { timestep: 1, weight: 0.5 })
    assert.ok(network.connections.some(connection => connection.from.id === network.layers[2].n[0].id && connection.to.id === network.layers[1].n[0].id))
    assert.ok(network.connections.some(connection => connection.timestep >= 1 && connection.from.position >= connection.to.position))
})

test("poker evaluator ranks stronger hands correctly", () => {
    const straightFlush = evaluateFive(["As", "Ks", "Qs", "Js", "Ts"])
    const quads = evaluateFive(["Ah", "Ad", "Ac", "As", "2d"])
    const fullHouse = evaluateSeven(["Ah", "Ad", "Ac", "Ks", "Kd", "2c", "3d"])
    assert.ok(compareRanks(straightFlush, quads) > 0)
    assert.equal(fullHouse.label, "full-house")
})

test("poker table resolves a deterministic showdown", () => {
    const table = new PokerTable({
        bigBlind: 2,
        players: [{ agent: new ScriptedAgent([{ type: "call" }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "hero", stack: 20 }, { agent: new ScriptedAgent([{ type: "check" }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "villain", stack: 20 }],
        smallBlind: 1,
        startingStack: 20
    })
    table.playHand({ deck: ["Kd", "Ah", "Kc", "Ad", "2s", "7d", "9h", "3c", "4d"] })
    const hero = table.players.find(player => player.id === "hero")
    const villain = table.players.find(player => player.id === "villain")
    assert.equal(hero.stack + villain.stack, 40)
    assert.ok(hero.stack > villain.stack)
})

test("poker platform aggregates chip deltas across generated tables", () => {
    const platform = new PokerPlatform({ bigBlind: 2, handsPerTable: 1, replacement: false, smallBlind: 1, startingStack: 20, tableSize: 2 })
    const entrants = [
        { agent: new ScriptedAgent([{ type: "call" }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "a" },
        { agent: new ScriptedAgent([{ type: "check" }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "b" }
    ]
    const result = platform.runGeneration(entrants, {
        deckFactory: () => ["Kd", "Ah", "Kc", "Ad", "2s", "7d", "9h", "3c", "4d"],
        hands: 1,
        tableSize: 2,
        tables: 1
    })
    assert.equal(result.standings.length, 2)
    assert.equal(result.standings.reduce((value, item) => value + item.chipsWon, 0), 0)
    assert.ok(result.standings[0].chipsWon !== result.standings[1].chipsWon)
})

test("poker observation encoding exposes richer normalized features", () => {
    const table = new PokerTable({
        bigBlind: 2,
        players: [{ agent: new ScriptedAgent([{ type: "call" }]), id: "hero", stack: 20 }, { agent: new ScriptedAgent([{ type: "raise", amount: 6 }]), id: "villain", stack: 20 }],
        smallBlind: 1,
        startingStack: 20
    })
    table.playHand({ deck: ["Kd", "Ah", "Kc", "Ad", "2s", "7d", "9h", "3c", "4d"] })
    const hero = table.players.find(player => player.id === "hero")
    const context = {
        ...table.observation(hero, hero.seat, {
            actionCount: 3,
            awaiting: new Set([hero.id]),
            currentBet: 4,
            lastAggressorSeat: 1,
            raiseCount: 1,
            stage: "flop"
        }),
        community: ["2s", "7d", "9h"]
    }
    const vector = encodeObservation(context)
    assert.equal(vector.length, OBSERVATION_SIZE)
    assert.ok(vector.every(value => Number.isFinite(value)))
    assert.equal(vector[18], 0)
    assert.ok(vector[26] >= 0)
})

test("poker NEAT flow autosaves checkpoints to disk", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-poker-checkpoints-"))
    try {
        const ecosystem = new Ecosystem({ recurrent: true, size: 2 })
        ecosystem.seed({ layers: [OBSERVATION_SIZE, 0, 5], recurrentSteps: 2, type: "neat" })
        const platform = new PokerPlatform({ bigBlind: 2, handsPerTable: 1, replacement: false, smallBlind: 1, startingStack: 20, tableSize: 2 })
        const result = await runNeatGeneration(ecosystem, {
            checkpoint: { directory, generation: 3 },
            generation: {
                deckFactory: () => ["Kd", "Ah", "Kc", "Ad", "2s", "7d", "9h", "3c", "4d"],
                hands: 1,
                tableSize: 2,
                tables: 1
            },
            platform
        })
        assert.ok(result.checkpoint.file.endsWith("generation-000003.json"))
        const saved = JSON.parse(await readFile(result.checkpoint.file, "utf8"))
        assert.equal(saved.generation, 3)
        assert.equal(saved.population.length, 2)
        assert.equal(saved.standings.length, 2)
    } finally {
        await rm(directory, { force: true, recursive: true })
    }
})

test("ecosystem speciation and reproduction keep a stable deterministic population", () => {
    setSeed(7)
    const ecosystem = new Ecosystem({
        size: 40,
        compatibility: 1.5,
        compatibilityStep: 0.1,
        targetSpecies: 4,
        survivalRate: 0.5,
        elitism: 0.1,
        mutation: {
            layer: 0,
            neuron: { rate: 0.02, max: 8, enable: 0.01, disable: 0.001 },
            bias: { rate: 0.05, min: -5, max: 5, change: [0, 0.5] },
            connection: { rate: 0.2, enable: 0.02, disable: 0.002 },
            timestep: { rate: 0, change: [0, 0] },
            node: 0.15,
            weight: { rate: 0.2, change: [0, 0.75], min: -5, max: 5 }
        }
    })

    ecosystem.seed({ layers: [2, 0, 1] })

    for (let generation = 0; generation < 15; generation++) {
        scoreXorPopulation(ecosystem)
        ecosystem.speciate()
        assert.equal(ecosystem.population.length, ecosystem.size)
        assert.ok(ecosystem.species.length >= 1)
        assert.equal(
            ecosystem.species.reduce((value, species) => value + species.length, 0),
            ecosystem.population.length
        )
        ecosystem.produce()
        assert.equal(ecosystem.population.length, ecosystem.size)
    }

    scoreXorPopulation(ecosystem)
    assert.ok(ecosystem.best().fitness > 2.5)
})

test("quantize snaps floats to ternary {-1, 0, +1}", () => {
    assert.equal(quantize(0.9), 1)
    assert.equal(quantize(-0.9), -1)
    assert.equal(quantize(0.1), 0)
    assert.equal(quantize(-0.1), 0)
    assert.equal(quantize(0.33), 0)
    assert.equal(quantize(0.34), 1)
    assert.equal(quantize(-0.34), -1)
})

test("bitnet network quantizes weights to ternary during forward pass", () => {
    setSeed(1)
    const network = new Network({ activator: false, bitnet: true, layers: [1, 1] })
    network.neurons.forEach(n => (n.bias = 0))
    const connection = network.connections[0]

    connection.weight = 0.8
    assert.deepEqual(network.calculate([1]), [1])

    connection.weight = -0.8
    assert.deepEqual(network.calculate([1]), [-1])

    connection.weight = 0.1
    assert.deepEqual(network.calculate([1]), [0])
})

test("bitnet encode/decode preserves bn flag and ternary forward pass", () => {
    setSeed(2)
    const network = new Network({ activator: false, bitnet: true, layers: [1, 1] })
    network.neurons.forEach(n => (n.bias = 0))
    network.connections[0].weight = 0.9

    const encoded = network.encode()
    assert.equal(encoded.bn, true)

    const clone = new Network(encoded)
    assert.equal(clone.bitnet, true)
    assert.deepEqual(clone.calculate([1]), [1])
})

test("bitnet ecosystem seeds networks with ternary weights and mutations stay ternary", () => {
    setSeed(5)
    const ecosystem = new Ecosystem({ bitnet: true, size: 10 })
    ecosystem.seed({ layers: [2, 0, 1] })

    const ternary = value => [-1, 0, 1].includes(value)

    ecosystem.population.forEach(network => {
        assert.equal(network.bitnet, true)
        network.connections.forEach(connection => assert.ok(ternary(connection.weight), `weight ${connection.weight} not ternary`))
    })

    ecosystem.population.forEach(network => ecosystem.mutate(network))
    ecosystem.population.forEach(network => {
        network.connections.forEach(connection => assert.ok(ternary(connection.weight), `mutated weight ${connection.weight} not ternary`))
    })
})

test("bitnet NEAT crossover offspring inherit bn flag and ternary weights", () => {
    setSeed(6)
    const ecosystem = new Ecosystem({ bitnet: true, size: 4 })
    ecosystem.seed({ layers: [1, 0, 1] })
    const [a, b] = ecosystem.population
    a.fitness = 5
    b.fitness = 3

    const child = ecosystem.crossover(a, b)
    assert.equal(child.bitnet, true)
    child.connections.forEach(connection => assert.ok([-1, 0, 1].includes(connection.weight), `crossover weight ${connection.weight} not ternary`))
})

test("preflopHandBucket classifies hands into correct strength buckets", () => {
    // Premium pairs → bucket 7
    assert.equal(preflopHandBucket(["Ah", "As"]), 7)
    assert.equal(preflopHandBucket(["Kh", "Ks"]), 7)
    assert.equal(preflopHandBucket(["Qh", "Qs"]), 7)
    // Strong broadway suited → bucket 6
    assert.equal(preflopHandBucket(["Ah", "Kh"]), 6)
    assert.equal(preflopHandBucket(["As", "Qs"]), 6)
    // Strong broadway offsuit → bucket 5
    assert.equal(preflopHandBucket(["Ah", "Kd"]), 5)
    assert.equal(preflopHandBucket(["Ac", "Qd"]), 5)
    // Medium pairs → bucket 4
    assert.equal(preflopHandBucket(["Jh", "Js"]), 4)
    assert.equal(preflopHandBucket(["7h", "7d"]), 4)
    // Suited connectors → bucket 3
    assert.equal(preflopHandBucket(["Jh", "Th"]), 3)
    assert.equal(preflopHandBucket(["9s", "8s"]), 3)
    // Small pairs → bucket 2
    assert.equal(preflopHandBucket(["6h", "6s"]), 2)
    assert.equal(preflopHandBucket(["2c", "2d"]), 2)
    // Speculative suited → bucket 1
    assert.equal(preflopHandBucket(["Ah", "5h"]), 1)
    assert.equal(preflopHandBucket(["Ks", "9s"]), 1)
    // Trash (offsuit non-premium) → bucket 0
    assert.equal(preflopHandBucket(["7h", "2d"]), 0)
    assert.equal(preflopHandBucket(["9c", "4d"]), 0)
    // Empty input → 0
    assert.equal(preflopHandBucket([]), 0)
})

test("opponent stats are tracked across hands and exposed in observation context", () => {
    const table = new PokerTable({
        bigBlind: 2,
        players: [
            { agent: new ScriptedAgent([{ type: "raise", amount: 6 }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "hero", stack: 100 },
            { agent: new ScriptedAgent([{ type: "call" }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "villain", stack: 100 }
        ],
        smallBlind: 1,
        startingStack: 100
    })
    table.playHand({ deck: ["Kd", "Ah", "Kc", "Ad", "2s", "7d", "9h", "3c", "4d"] })

    // After one hand, hero (raiser) should have pfr=1, vpip=1 and villain (caller) vpip=1
    const heroStats = table.opponentStats.get("hero")
    const villainStats = table.opponentStats.get("villain")
    assert.ok(heroStats)
    assert.ok(villainStats)
    assert.ok(heroStats.pfr >= 1)
    assert.ok(heroStats.vpip >= 1)
    assert.ok(villainStats.vpip >= 1)
    assert.equal(villainStats.pfr, 0)
})

test("opponent modeling features appear in observation and observation vector", () => {
    const table = new PokerTable({
        bigBlind: 2,
        players: [
            { agent: new ScriptedAgent([{ type: "call" }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "hero", stack: 40 },
            { agent: new ScriptedAgent([{ type: "raise", amount: 6 }, { type: "check" }, { type: "check" }, { type: "check" }]), id: "villain", stack: 40 }
        ],
        smallBlind: 1,
        startingStack: 40
    })
    table.playHand({ deck: ["Kd", "Ah", "Kc", "Ad", "2s", "7d", "9h", "3c", "4d"] })

    const hero = table.players.find(p => p.id === "hero")
    const ctx = table.observation(hero, hero.seat, {
        actionCount: 1, awaiting: new Set([hero.id]), currentBet: 2, lastAggressorSeat: 1, raiseCount: 0, stage: "flop"
    })
    assert.ok("avgOpponentVPIP" in ctx)
    assert.ok("avgOpponentPFR" in ctx)
    assert.ok("avgOpponentAggression" in ctx)
    assert.ok(ctx.avgOpponentVPIP >= 0 && ctx.avgOpponentVPIP <= 1)
    assert.ok(ctx.avgOpponentPFR >= 0 && ctx.avgOpponentPFR <= 1)
    assert.ok(ctx.avgOpponentAggression >= 0 && ctx.avgOpponentAggression <= 1)

    const vector = encodeObservation({ ...ctx, community: ["2s", "7d", "9h"] })
    assert.equal(vector.length, OBSERVATION_SIZE)
    assert.ok(vector.every(v => Number.isFinite(v)))
})

test("linear fitness discounting increments generationCount and applies temporal discount", () => {
    const standings = [{ id: "g0", chipsWon: 100, hands: 100, appearances: 1, maxHands: 100 }]

    // Fresh genome: no _previousFitness, _generationCount increments to 1 on first call
    const genome = { _previousFitness: undefined, _generationCount: undefined }
    assignFitnessFromStandings([genome], standings, { bigBlind: 10, fitnessSmoothing: 0.55, idFor: (_, i) => `g${i}` })
    assert.equal(genome._generationCount, 1)
    const firstFitness = genome.fitness

    // Second generation: _generationCount increments to 2 before discount is applied
    // discountFactor = 2 / (2 + 1) = 2/3
    const standings2 = [{ id: "g0", chipsWon: 0, hands: 100, appearances: 1, maxHands: 100 }]
    assignFitnessFromStandings([genome], standings2, { bigBlind: 10, fitnessSmoothing: 0.55, idFor: (_, i) => `g${i}` })
    assert.equal(genome._generationCount, 2)
    // fitness = 0.55 * 0 + 0.45 * (2/3) * firstFitness
    const expected = 0.55 * 0 + 0.45 * (2 / 3) * firstFitness
    assert.ok(Math.abs(genome.fitness - expected) < 1e-9)
})

test("generationCount is serialized and restored in NEAT checkpoints", () => {
    const ecosystem = new Ecosystem({ recurrent: true, size: 2 })
    ecosystem.seed({ layers: [OBSERVATION_SIZE, 0, 5], recurrentSteps: 1, type: "neat" })
    ecosystem.population[0]._generationCount = 5
    ecosystem.population[1]._generationCount = 3

    const payload = serializeCheckpoint(ecosystem, { standings: [] }, { generation: 1 })
    assert.equal(payload.population[0].generationCount, 5)
    assert.equal(payload.population[1].generationCount, 3)
})
