import Network from "./Network.js"
import { chance, merge, random, randomFloat } from "./Utils.js"
import activators from "./Activators.js"

class Ecosystem {
    constructor(config = {}) {
        this.mutation = merge(
            {
                layer: 0,
                neuron: { rate: 0.001, enable: 0.01, disable: 0.001 }, // Add "max" to limit the number of neurons.
                bias: { rate: 0.1, change: [0, 2] }, // Add min/max to limit the value biases.
                connection: { rate: 0.01, enable: 0.01, disable: 0.001 },
                timestep: { rate: 0.01, change: [0, 2] },
                node: 0.5,
                weight: { rate: 0.1, change: [0, 2] } // Add min/max to limit the value of weights.
            },
            config?.mutation
        )
        this.population = config.population || [] // Population.
        this.species = config.species || [] // Species.
        this.size = config.size || 100 // Population size.
        // Coefficients for compatibility calculation.
        this.edc = config.edc || config.excessDisjointCoefficient || 1 // Excess and disjoint coefficient.
        this.wdc = config.wdc || config.weightDifferenceCoefficient || 0.5 // Weight difference coefficient.
        this.compatibility = config.compatibility || 3 // Compatibility threshold.
        this.compatibilityStep = config.compatibilityStep || 0.25
        this.minCompatibility = config.minCompatibility || 0.5
        this.targetSpecies = config.targetSpecies || Math.max(2, Math.round(Math.sqrt(this.size)))
        this.survivalRate = config.survivalRate || 0.4
        this.elitism = config.elitism || 0.05
    }

    best(population = this.population) {
        return [...population].sort((a, b) => (b.fitness || 0) - (a.fitness || 0)).shift()
    }

    averageFitness(population = this.population) {
        if (!population.length) return 0
        return population.reduce((value, individual) => (value += individual.fitness), 0) / population.length
    }

    connectionKey(connection = {}) {
        const from = connection.from?.id ?? connection["<"]
        const to = connection.to?.id ?? connection[">"]
        return `${from}-${to}`
    }

    distance(N1 = {}, N2 = {}) {
        const map1 = new Map((N1.connections || []).map(connection => [this.connectionKey(connection), connection]))
        const map2 = new Map((N2.connections || []).map(connection => [this.connectionKey(connection), connection]))
        const keys = new Set([...map1.keys(), ...map2.keys()])
        let matching = 0
        let weightDifference = 0
        let unmatching = 0

        keys.forEach(key => {
            const gene1 = map1.get(key)
            const gene2 = map2.get(key)
            if (gene1 && gene2) {
                matching++
                weightDifference += Math.abs(gene1.weight - gene2.weight)
            } else unmatching++
        })

        const awd = matching === 0 ? 1 : weightDifference / matching
        const normalizer = Math.max(keys.size, 1)
        return (this.edc * unmatching) / normalizer + this.wdc * awd
    }

    compare(N1 = {}, N2 = {}) {
        return this.distance(N1, N2) <= this.compatibility
    }

    sortSpecies(species = []) {
        return [...species].sort((a, b) => (b.fitness || 0) - (a.fitness || 0))
    }

    speciate(population = this.population) {
        this.species = []
        population.forEach(individual => {
            let speciated = false
            for (const species of this.species)
                if (species.length) {
                    const sample = species.representative || species[0]
                    if (this.compare(individual, sample)) {
                        species.push(individual)
                        speciated = true
                        break
                    }
                }
            // If no species found, create a new species for this individual.
            if (!speciated) {
                const next = [individual]
                next.representative = individual
                this.species.push(next)
            }
        })
        this.species = this.species.map(species => {
            const ranked = this.sortSpecies(species)
            ranked.representative = ranked[0]
            ranked.adjustedFitness = ranked.reduce((value, individual) => value + Math.max(individual.fitness || 0, 0) / ranked.length, 0)
            return ranked
        })
        if (population.length > 1) {
            if (this.species.length > this.targetSpecies * 1.25) this.compatibility += this.compatibilityStep
            else if (this.species.length < this.targetSpecies * 0.75) this.compatibility = Math.max(this.minCompatibility, this.compatibility - this.compatibilityStep)
        }
        return this.species
    }

    select(species = []) {
        if (!species.length) return undefined
        const ranked = this.sortSpecies(species)
        const seed = randomFloat()
        if (seed < 0.25) return ranked[0]
        if (seed < 0.375 && ranked.length > 1) return ranked[1]
        if (seed < 0.5 && ranked.length > 2) return ranked[2]
        const threshold = randomFloat(
            0,
            ranked.reduce((value, individual) => (value += Math.max(individual.fitness || 0, 0) + 1e-6), 0)
        )
        let sum = 0
        return (
            ranked.find(individual => {
                sum += Math.max(individual.fitness || 0, 0) + 1e-6
                if (sum > threshold) return true
            }) || random(species)
        )
    }

    crossover(...parents) {
        if (!parents.length || parents.some(parent => typeof parent !== "object")) return

        parents = parents.map(parent => parent.encode())

        const child = { l: [], n: [], c: [] }

        parents.forEach(parent => {
            // Copy non-objective properties.
            Object.keys(parent).forEach(key => {
                const values = parents.filter(item => !["undefined", "object"].includes(typeof item[key]) && typeof child[key] === "undefined").map(item => item[key])
                if (values.length) child[key] = random(values)
            })

            parent.l.forEach((item, index) => {
                // Get all layers that have the 'index' of 'layer' but don't exist in child.l.
                const layers = parents.filter(item => typeof item.l[index] !== "undefined" && typeof child.l[index] === "undefined").map(item => item.l[index])
                const layer = random(layers)
                if (Array.isArray(layer)) child.l.push([])
                else if (typeof layer === "object") child.l.push({ ...layer, n: [] })
            })

            parent.n.forEach(neuron => {
                // Get all neurons that matches # of 'neuron' but don't exist in child.n.
                const match = n => n["#"] === neuron["#"]
                const neurons = parents.filter(item => item.n.some(match) && !child.n.some(match)).map(item => item.n.find(match))
                if (neurons.length) child.n.push(random(neurons))
            })

            parent.c.forEach(connection => {
                // Get all connections that matches '<' and '>' of 'connection' but don't exist in child.c.
                const match = c => c["<"] === connection["<"] && c[">"] === connection[">"]
                const connections = parents.filter(item => item.c.some(match) && !child.c.some(match)).map(item => item.c.find(match))
                if (connections.length) child.c.push(random(connections))
            })
        })

        child.n.forEach(neuron => {
            const indexes = parents
                .filter(item => item.n.some(n => n["#"] === neuron["#"]))
                .map(item => {
                    const index = item.l.findIndex(l => (l?.n || l).includes(neuron["#"]))
                    // Return the index of the last layer of child if this neuron belongs to the last layer of its network.
                    if (index === item.l.length - 1) return child.l.length - 1
                    // By default, return the normal index.
                    return index
                })
            // Put the neuron to the first layer, or the last layer, or a random layer between the first and the last layers.
            const index = indexes.includes(0) ? 0 : indexes.includes(child.l.length - 1) ? child.l.length - 1 : random(indexes)
            const layer = child.l[index]?.n || child.l[index]
            layer.push(neuron["#"])
        })

        return new Network(child)
    }

    clone(network) {
        return new Network(network.encode())
    }

    layerIndexes(network) {
        const indexes = {}
        network.layers.forEach((layer, index) => layer.n.forEach(neuron => (indexes[neuron.id] = index)))
        return indexes
    }

    addRandomLayer(network, fromIndex, toIndex) {
        if (toIndex - fromIndex > 1) return random(fromIndex + 1, toIndex - 1)
        network.layer({ index: toIndex })
        return toIndex
    }

    mutate(network) {
        // Add new random layer.
        if (chance(this.mutation.layer) && !network.layers.filter(l => !l.n.length).length) network.layer({ index: random(1, network.layers.length - 2) })

        // Add new random neuron.
        if (chance(this.mutation.neuron.rate) && (isNaN(this.mutation.neuron.max) || network.neurons.length < this.mutation.neuron.max)) {
            const index = Math.max(1, Math.min(network.layers.length - 2, random(1, Math.max(1, network.layers.length - 2))))
            network.neuron({ layer: index, activator: random(Object.keys(activators)) })
        }

        // Add new random connection.
        if (chance(this.mutation.connection.rate)) {
            const indexes = this.layerIndexes(network)
            const candidates = []
            network.neurons.forEach(from =>
                network.neurons.forEach(to => {
                    if (from.id === to.id) return
                    if (indexes[from.id] >= indexes[to.id]) return
                    if (network.connections.some(c => c.from.id === from.id && c.to.id === to.id)) return
                    candidates.push({ from, to })
                })
            )
            if (candidates.length) network.connect(random(candidates))
        }

        // Add new random node between a connection.
        if (chance(this.mutation.node) && network.connections.length && (typeof this.mutation.neuron.max === "undefined" || network.neurons.length < this.mutation.neuron.max)) {
            const connection = random(network.connections.filter(connection => connection.state))
            if (connection) {
                const indexes = this.layerIndexes(network)
                const layer = this.addRandomLayer(network, indexes[connection.from.id], indexes[connection.to.id])
                const neuron = network.neuron({ layer, activator: random(Object.keys(activators)), bias: 0 })
                connection.state = false
                network.connect({ from: connection.from, to: neuron, weight: 1 })
                network.connect({ from: neuron, to: connection.to, weight: connection.weight })
            }
        }

        network.neurons.forEach(neuron => {
            // Change random neuron biases.
            if (chance(this.mutation.bias.rate)) {
                const scale = Math.abs(neuron.bias) || 1
                neuron.bias += scale * randomFloat(...this.mutation.bias.change) * random([-1, 1])
                if (!isNaN(this.mutation.bias.min)) neuron.bias = Math.max(neuron.bias, this.mutation.bias.min)
                if (!isNaN(this.mutation.bias.max)) neuron.bias = Math.min(neuron.bias, this.mutation.bias.max)
            }
            // Enable random neuron.
            if (!neuron.state && chance(this.mutation.neuron.enable) && ![...network.layers[0].n, ...network.layers[network.layers.length - 1].n].some(n => n.id === neuron.id)) neuron.state = true
            // Disable random neuron.
            if (neuron.state && chance(this.mutation.neuron.disable) && ![...network.layers[0].n, ...network.layers[network.layers.length - 1].n].some(n => n.id === neuron.id)) neuron.state = false
        })

        network.connections.forEach(connection => {
            // Change random connection weight.
            if (chance(this.mutation.weight.rate)) {
                const scale = Math.abs(connection.weight) || 1
                connection.weight += scale * randomFloat(...this.mutation.weight.change) * random([-1, 1])
                if (typeof this.mutation.weight.min !== "undefined") connection.weight = Math.max(connection.weight, this.mutation.weight.min)
                if (typeof this.mutation.weight.max !== "undefined") connection.weight = Math.min(connection.weight, this.mutation.weight.max)
            }
            // Change random connection timestep.
            if (chance(this.mutation.timestep.rate)) {
                const scale = Math.abs(connection.timestep) || 1
                connection.timestep += scale * randomFloat(...this.mutation.timestep.change) * random([-1, 1])
                if (typeof this.mutation.timestep.min !== "undefined") connection.timestep = Math.max(connection.timestep, this.mutation.timestep.min)
                if (typeof this.mutation.timestep.max !== "undefined") connection.timestep = Math.min(connection.timestep, this.mutation.timestep.max)
            }
            // Enable random connections.
            if (!connection.state && chance(this.mutation.connection.enable)) connection.state = true
            // Disable random connections.
            if (connection.state && chance(this.mutation.connection.disable)) connection.state = false
        })
    }

    produce() {
        if (!this.population.length) return this.population
        const speciesGroups = this.species.length ? this.species : this.speciate()
        const generation = []
        const weighted = speciesGroups.map(species => ({
            species,
            score: Math.max(species.adjustedFitness || 0, 1e-6)
        }))
        const total = weighted.reduce((value, item) => value + item.score, 0) || 1
        const quotas = weighted.map(item => ({ ...item, exact: (item.score / total) * this.size }))
        const counts = quotas.map(item => Math.floor(item.exact))
        let remainder = this.size - counts.reduce((value, count) => value + count, 0)

        quotas
            .map((item, index) => ({ index, remainder: item.exact - counts[index] }))
            .sort((a, b) => b.remainder - a.remainder)
            .forEach(item => {
                if (remainder <= 0) return
                counts[item.index]++
                remainder--
            })

        quotas.forEach((item, index) => {
            const species = item.species
            const count = counts[index]
            if (!count || !species.length) return

            const survivors = this.sortSpecies(species).slice(0, Math.max(1, Math.ceil(species.length * this.survivalRate)))
            const eliteCount = Math.min(count, Math.max(1, Math.round(count * this.elitism)))

            for (let i = 0; i < eliteCount; i++) generation.push(this.clone(survivors[i % survivors.length]))

            for (let i = eliteCount; i < count; i++) {
                const father = this.select(survivors)
                const mother = survivors.length > 1 ? this.select(survivors) : father
                const child = father && mother ? this.crossover(father, mother) : this.clone(survivors[0])
                this.mutate(child)
                generation.push(child)
            }
        })

        while (generation.length < this.size && weighted.length) {
            const species = this.select(random(weighted).species)
            if (!species) break
            const child = this.clone(species)
            this.mutate(child)
            generation.push(child)
        }

        this.population = generation.slice(0, this.size)
        return this.population
    }

    seed(config = {}) {
        this.population = []
        for (let i = 0; i < this.size; i++) this.population.push(new Network(config))
        return this.population
    }
}

export default Ecosystem
