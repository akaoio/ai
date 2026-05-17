import assert from "node:assert/strict"
import test from "node:test"

import Ecosystem from "../Ecosystem.js"
import Network from "../Network.js"
import { setSeed } from "../Utils.js"
import { XOR } from "./exams.js"

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
