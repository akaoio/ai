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
