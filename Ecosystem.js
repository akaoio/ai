import Network from "./Network.js"
import { chance, merge, random, randomFloat } from "./Utils.js"

class Ecosystem {
    constructor(config = {}) {
        this.mutation = merge(
            {
                layer: 0,
                neuron: { rate: 0.001, max: undefined, enable: 0.01, disable: 0.001 },
                bias: { rate: 0.1, change: [0, 2] },
                connection: { rate: 0.01, enable: 0.01, disable: 0.001 },
                timestep: { rate: 0.01, change: [0, 2] },
                node: 0.5,
                weight: { rate: 0.1, change: [0, 2] }
            },
            config?.mutation
        )
        this.population = config.population || []
        this.species = config.species || []
        this.size = config.size || 100
        this.xdc = config.xdc || config.excessCoefficient || config.edc || config.excessDisjointCoefficient || 1
        this.ddc = config.ddc || config.disjointCoefficient || config.edc || config.excessDisjointCoefficient || 1
        this.wdc = config.wdc || config.weightDifferenceCoefficient || 0.5
        this.compatibility = config.compatibility || 3
        this.compatibilityStep = config.compatibilityStep || 0.25
        this.minCompatibility = config.minCompatibility || 0.5
        this.targetSpecies = config.targetSpecies || Math.max(2, Math.round(Math.sqrt(this.size)))
        this.survivalRate = config.survivalRate || 0.4
        this.elitism = config.elitism || 0.05
        this.stagnation = config.stagnation || 15
        this.disableOnInheritance = config.disableOnInheritance || 0.75
        this.recurrent = typeof config.recurrent !== "undefined" ? config.recurrent : true
        this.nextConnectionInnovation = config.nextConnectionInnovation || 0
        this.nextNodeInnovation = config.nextNodeInnovation || 0
        this.nextSpeciesId = config.nextSpeciesId || 0
        this.connectionHistory = new Map(config.connectionHistory || [])
        this.splitHistory = new Map(config.splitHistory || [])
        this.bitnet = config.bitnet ?? false // BitNet mode: use ternary {-1, 0, +1} weights throughout evolution.
    }

    best(population = this.population) {
        return [...population].sort((a, b) => (b.fitness || 0) - (a.fitness || 0)).shift()
    }

    averageFitness(population = this.population) {
        if (!population.length) return 0
        return population.reduce((value, individual) => value + (individual.fitness || 0), 0) / population.length
    }

    sortSpecies(species = []) {
        return [...species].sort((a, b) => (b.fitness || 0) - (a.fitness || 0))
    }

    layerIndexes(network) {
        const indexes = {}
        network.layers.forEach((layer, index) => layer.n.forEach(neuron => (indexes[neuron.id] = index)))
        return indexes
    }

    isRecurrentPair(from, to) {
        return (from.position ?? 0) >= (to.position ?? 0)
    }

    nodeGene(neuron) {
        return {
            "#": neuron.id,
            a: neuron.activator,
            b: neuron.bias,
            k: neuron.kind,
            p: neuron.position,
            s: neuron.s
        }
    }

    connectionGene(connection) {
        return {
            "<": connection.from.id,
            ">": connection.to.id,
            s: connection.s,
            t: connection.timestep,
            w: connection.weight,
            x: connection.innovation
        }
    }

    ensureNodeMetadata(network) {
        const last = network.layers.length - 1
        network.layers.forEach((layer, index) =>
            layer.n.forEach(neuron => {
                neuron.position = index
                if (!neuron.kind) neuron.kind = index === 0 ? "input" : index === last ? "output" : "hidden"
                else if (index === 0) neuron.kind = "input"
                else if (index === last) neuron.kind = "output"
            })
        )
        const maxNodeId = network.neurons.reduce((value, neuron) => Math.max(value, Number(neuron.id) || 0), -1)
        this.nextNodeInnovation = Math.max(this.nextNodeInnovation, maxNodeId + 1)
    }

    registerConnectionInnovation(fromId, toId, innovation) {
        const key = `${fromId}:${toId}`
        if (!this.connectionHistory.has(key)) this.connectionHistory.set(key, !isNaN(innovation) ? Number(innovation) : this.nextConnectionInnovation++)
        else if (!isNaN(innovation)) this.connectionHistory.set(key, Number(innovation))
        const value = this.connectionHistory.get(key)
        this.nextConnectionInnovation = Math.max(this.nextConnectionInnovation, value + 1)
        return value
    }

    registerSplitInnovation(connection) {
        const innovation = connection.innovation
        if (isNaN(innovation)) throw new Error("Cannot split a connection without an innovation number")
        if (!this.splitHistory.has(innovation)) {
            const nodeId = this.nextNodeInnovation++
            const leftInnovation = this.registerConnectionInnovation(connection.from.id, nodeId)
            const rightInnovation = this.registerConnectionInnovation(nodeId, connection.to.id)
            this.splitHistory.set(innovation, { nodeId, leftInnovation, rightInnovation })
        }
        return this.splitHistory.get(innovation)
    }

    ensureCanonical(network) {
        if (!network) return network
        network.type = "neat"
        this.ensureNodeMetadata(network)
        network.connections.forEach(connection => {
            connection.innovation = this.registerConnectionInnovation(connection.from.id, connection.to.id, connection.innovation)
        })
        return network
    }

    connectionGenes(network) {
        this.ensureCanonical(network)
        return network.connections
            .map(connection => this.connectionGene(connection))
            .sort((a, b) => a.x - b.x)
    }

    distance(N1 = {}, N2 = {}) {
        const genes1 = this.connectionGenes(N1)
        const genes2 = this.connectionGenes(N2)
        let matching = 0
        let weightDifference = 0
        let disjoint = 0
        let excess = 0
        let i = 0
        let j = 0
        const max1 = genes1.length ? genes1[genes1.length - 1].x : -1
        const max2 = genes2.length ? genes2[genes2.length - 1].x : -1

        while (i < genes1.length && j < genes2.length) {
            if (genes1[i].x === genes2[j].x) {
                matching++
                weightDifference += Math.abs(genes1[i].w - genes2[j].w)
                i++
                j++
                continue
            }
            if (genes1[i].x < genes2[j].x) {
                if (genes1[i].x > max2) excess++
                else disjoint++
                i++
                continue
            }
            if (genes2[j].x > max1) excess++
            else disjoint++
            j++
        }

        while (i < genes1.length) {
            if (genes1[i].x > max2) excess++
            else disjoint++
            i++
        }

        while (j < genes2.length) {
            if (genes2[j].x > max1) excess++
            else disjoint++
            j++
        }

        const awd = matching === 0 ? 0 : weightDifference / matching
        const normalizer = Math.max(genes1.length, genes2.length)
        const size = normalizer < 20 ? 1 : normalizer
        // BitNet weights are ternary {-1,0,1} — tiny diffs collapse all genomes into 1 species.
        // Use topology-only distance (excess + disjoint) so speciation works on structure.
        const weightContribution = this.bitnet ? 0 : this.wdc * awd
        return (this.xdc * excess) / size + (this.ddc * disjoint) / size + weightContribution
    }

    compare(N1 = {}, N2 = {}) {
        return this.distance(N1, N2) <= this.compatibility
    }

    speciate(population = this.population) {
        population.forEach(individual => this.ensureCanonical(individual))

        const groups = this.species.map(species => {
            const next = []
            next.id = species.id
            next.representative = species.representative || species[0]
            next.bestFitness = species.bestFitness ?? -Infinity
            next.stagnant = species.stagnant || 0
            return next
        })

        population.forEach(individual => {
            let candidate
            let bestDistance = Infinity
            groups.forEach(species => {
                if (!species.representative) return
                const distance = this.distance(individual, species.representative)
                if (distance <= this.compatibility && distance < bestDistance) {
                    bestDistance = distance
                    candidate = species
                }
            })

            if (!candidate) {
                candidate = []
                candidate.id = ++this.nextSpeciesId
                candidate.representative = individual
                candidate.bestFitness = -Infinity
                candidate.stagnant = 0
                groups.push(candidate)
            }

            candidate.push(individual)
        })

        this.species = groups
            .filter(species => species.length)
            .map(species => {
                const ranked = this.sortSpecies(species)
                const bestFitness = ranked[0]?.fitness || 0
                ranked.id = species.id
                ranked.representative = random(ranked)
                ranked.bestFitness = Math.max(species.bestFitness ?? -Infinity, bestFitness)
                ranked.stagnant = bestFitness > (species.bestFitness ?? -Infinity) ? 0 : (species.stagnant || 0) + 1
                ranked.adjustedFitness = ranked.reduce((value, individual) => value + Math.max((individual.fitness || 0) / ranked.length, 0), 0)
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
        const threshold = randomFloat(
            0,
            ranked.reduce((value, individual) => value + Math.max(individual.fitness || 0, 0) + 1e-6, 0)
        )
        let sum = 0
        return (
            ranked.find(individual => {
                sum += Math.max(individual.fitness || 0, 0) + 1e-6
                return sum >= threshold
            }) || ranked[0]
        )
    }

    chooseNodeGene(nodeMaps, id) {
        for (const map of nodeMaps) if (map.has(id)) return { ...map.get(id) }
    }

    buildChild(primary, secondary, connections = []) {
        const primaryNodes = new Map(primary.neurons.map(neuron => [neuron.id, this.nodeGene(neuron)]))
        const secondaryNodes = new Map(secondary.neurons.map(neuron => [neuron.id, this.nodeGene(neuron)]))
        const nodeIds = new Set()

        ;[primary, secondary].forEach(parent =>
            parent.neurons.forEach(neuron => {
                if (["input", "output"].includes(neuron.kind)) nodeIds.add(neuron.id)
            })
        )

        connections.forEach(connection => {
            nodeIds.add(connection["<"])
            nodeIds.add(connection[">"])
        })

        const nodes = [...nodeIds]
            .map(id => this.chooseNodeGene([primaryNodes, secondaryNodes], id))
            .filter(Boolean)
            .sort((a, b) => (a.p ?? 0) - (b.p ?? 0) || a["#"] - b["#"])

        const maxPosition = nodes.reduce((value, node) => Math.max(value, node.p ?? 0), 0)
        const layers = Array.from({ length: maxPosition + 1 }, () => [])
        nodes.forEach(node => layers[node.p ?? 0].push(node["#"]))

        const child = new Network({
            a: primary.activator,
            bn: primary.bitnet,
            c: connections,
            l: layers,
            n: nodes,
            t: "neat"
        })

        return this.ensureCanonical(child)
    }

    crossover(parentA, parentB) {
        if (!parentA || !parentB) return undefined

        this.ensureCanonical(parentA)
        this.ensureCanonical(parentB)

        const fitnessA = parentA.fitness || 0
        const fitnessB = parentB.fitness || 0
        const equalFitness = fitnessA === fitnessB
        const [primary, secondary] = equalFitness ? (chance(0.5) ? [parentA, parentB] : [parentB, parentA]) : fitnessA > fitnessB ? [parentA, parentB] : [parentB, parentA]
        const primaryGenes = new Map(this.connectionGenes(primary).map(connection => [connection.x, connection]))
        const secondaryGenes = new Map(this.connectionGenes(secondary).map(connection => [connection.x, connection]))
        const innovations = [...new Set([...primaryGenes.keys(), ...secondaryGenes.keys()])].sort((a, b) => a - b)
        const childConnections = []

        innovations.forEach(innovation => {
            const primaryGene = primaryGenes.get(innovation)
            const secondaryGene = secondaryGenes.get(innovation)
            let chosen

            if (primaryGene && secondaryGene) chosen = { ...(chance(0.5) ? primaryGene : secondaryGene) }
            else if (equalFitness) chosen = { ...(primaryGene || secondaryGene) }
            else if (primaryGene) chosen = { ...primaryGene }

            if (!chosen) return
            if ((primaryGene && !primaryGene.s) || (secondaryGene && !secondaryGene.s)) chosen.s = !chance(this.disableOnInheritance)
            childConnections.push(chosen)
        })

        return this.buildChild(primary, secondary, childConnections)
    }

    clone(network) {
        return this.ensureCanonical(new Network(network.encode()))
    }

    insertSplitLayer(network, fromPosition, toPosition) {
        if (toPosition - fromPosition > 1) return fromPosition + 1
        network.layer({ index: toPosition })
        this.ensureNodeMetadata(network)
        return fromPosition + 1
    }

    connectGene(network, from, to, config = {}) {
        const existing = network.connections.find(connection => connection.from.id === from.id && connection.to.id === to.id)
        const innovation = this.registerConnectionInnovation(from.id, to.id, config.x ?? config.innovation)
        if (existing) {
            existing.innovation = innovation
            if (!isNaN(config.w) || !isNaN(config.weight)) existing.weight = !isNaN(config.w) ? Number(config.w) : Number(config.weight)
            if (!isNaN(config.t) || !isNaN(config.timestep)) existing.timestep = !isNaN(config.t) ? Number(config.t) : Number(config.timestep)
            if (typeof config.s !== "undefined" || typeof config.state !== "undefined") existing.s = typeof config.s !== "undefined" ? config.s : config.state
            else existing.s = true
            return existing
        }
        network.connect({
            from,
            s: typeof config.s !== "undefined" ? config.s : typeof config.state !== "undefined" ? config.state : true,
            t: config.t ?? config.timestep,
            to,
            w: config.w ?? config.weight,
            x: innovation
        })
        return network.connections[network.connections.length - 1]
    }

    mutateAddConnection(network) {
        const candidates = []
        network.neurons.forEach(from =>
            network.neurons.forEach(to => {
                if (from.id === to.id) return
                if (to.kind === "input") return
                if (!this.recurrent && this.isRecurrentPair(from, to)) return
                if (!this.recurrent && from.kind === "output") return
                candidates.push({ from, to })
            })
        )
        const choice = random(candidates)
        if (!choice) return
        this.connectGene(network, choice.from, choice.to, {
            timestep: this.isRecurrentPair(choice.from, choice.to) ? 1 : 0,
            weight: this.bitnet ? random([-1, 0, 1]) : randomFloat(-1, 1)
        })
    }

    mutateAddNode(network) {
        const connection = random(network.connections.filter(item => item.s && !this.isRecurrentPair(item.from, item.to)))
        if (!connection) return

        const split = this.registerSplitInnovation(connection)
        const fromPosition = connection.from.position ?? 0
        const toPosition = connection.to.position ?? network.layers.length - 1
        const position = this.insertSplitLayer(network, fromPosition, toPosition)
        let neuron = network.neurons.find(item => item.id === split.nodeId)

        connection.s = false

        if (!neuron) {
            neuron = network.neuron({
                a: network.activator,
                b: 0,
                id: split.nodeId,
                k: "hidden",
                layer: position,
                p: position,
                s: true
            })
        } else {
            neuron.s = true
        }

        this.ensureNodeMetadata(network)
        const rightWeight = this.bitnet ? (connection.weight !== 0 ? connection.weight : 1) : connection.weight
        this.connectGene(network, connection.from, neuron, { s: true, w: 1, x: split.leftInnovation })
        this.connectGene(network, neuron, connection.to, { s: true, w: rightWeight, x: split.rightInnovation })
    }

    mutate(network) {
        this.ensureCanonical(network)

        if (chance(this.mutation.connection.rate)) this.mutateAddConnection(network)
        if (chance(this.mutation.node) && (typeof this.mutation.neuron.max === "undefined" || network.neurons.length < this.mutation.neuron.max)) this.mutateAddNode(network)

        network.neurons.forEach(neuron => {
            if (chance(this.mutation.bias.rate)) {
                const scale = Math.abs(neuron.bias) || 1
                neuron.bias += scale * randomFloat(...this.mutation.bias.change) * random([-1, 1])
                if (!isNaN(this.mutation.bias.min)) neuron.bias = Math.max(neuron.bias, this.mutation.bias.min)
                if (!isNaN(this.mutation.bias.max)) neuron.bias = Math.min(neuron.bias, this.mutation.bias.max)
            }
            if (!neuron.state && neuron.kind === "hidden" && chance(this.mutation.neuron.enable)) neuron.state = true
            if (neuron.state && neuron.kind === "hidden" && chance(this.mutation.neuron.disable)) neuron.state = false
        })

        network.connections.forEach(connection => {
            if (chance(this.mutation.weight.rate)) {
                if (this.bitnet) {
                    connection.weight = random([-1, 0, 1])
                } else {
                    const scale = Math.abs(connection.weight) || 1
                    connection.weight += scale * randomFloat(...this.mutation.weight.change) * random([-1, 1])
                    if (!isNaN(this.mutation.weight.min)) connection.weight = Math.max(connection.weight, this.mutation.weight.min)
                    if (!isNaN(this.mutation.weight.max)) connection.weight = Math.min(connection.weight, this.mutation.weight.max)
                }
            }
            if (chance(this.mutation.timestep.rate)) {
                const scale = Math.abs(connection.timestep) || 1
                connection.timestep += scale * randomFloat(...this.mutation.timestep.change) * random([-1, 1])
                if (!isNaN(this.mutation.timestep.min)) connection.timestep = Math.max(connection.timestep, this.mutation.timestep.min)
                if (!isNaN(this.mutation.timestep.max)) connection.timestep = Math.min(connection.timestep, this.mutation.timestep.max)
            }
            if (!connection.s && chance(this.mutation.connection.enable)) connection.s = true
            if (connection.s && chance(this.mutation.connection.disable)) connection.s = false
        })

        return this.ensureCanonical(network)
    }

    produce() {
        if (!this.population.length) return this.population
        const speciesGroups = this.species.length ? this.species : this.speciate()
        const champion = this.best()
        const viable = speciesGroups.filter(species => species.stagnant < this.stagnation || species.includes(champion))
        const activeSpecies = viable.length ? viable : speciesGroups
        const generation = []
        const weighted = activeSpecies.map(species => ({
            score: Math.max(species.adjustedFitness || 0, 1e-6),
            species
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

        while (generation.length < this.size && activeSpecies.length) {
            const species = random(activeSpecies)
            const child = this.clone(this.select(species))
            this.mutate(child)
            generation.push(child)
        }

        this.population = generation.slice(0, this.size).map(individual => this.ensureCanonical(individual))
        return this.population
    }

    seed(config = {}) {
        this.population = []
        const template = this.ensureCanonical(new Network({ ...config, type: "neat", bn: this.bitnet }))
        if (this.bitnet) template.connections.forEach(c => (c.weight = random([-1, 0, 1])))
        this.population.push(template)
        for (let i = 1; i < this.size; i++) this.population.push(this.clone(template))
        return this.population
    }
}

export default Ecosystem
