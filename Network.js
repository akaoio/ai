import Connection from "./Connection.js"
import Layer from "./Layer.js"
import Neuron from "./Neuron.js"
import activators from "./Activators.js"
import derivatives from "./Derivatives.js"

class Network {
    constructor(config = {}) {
        // Try to decode if type of config is encoded.
        if (this.encoded(config)) return this.decode(config)

        this.initialize(config)

        const neurons = config.n || config.neurons
        if (neurons) this.neuron(neurons)

        const layers = config.l || config.layers
        if (layers) this.layer(layers)

        const connections = config.c || config.connections
        if (connections) this.connect(connections)
    }

    get layers() {
        return this.l
    }

    set layers(value) {
        this.l = value
        return this.l
    }

    get neurons() {
        return this.n
    }

    set neurons(value) {
        this.n = value
        return this.n
    }

    get connections() {
        return this.c
    }

    set connections(value) {
        this.c = value
        return this.c
    }

    get type() {
        return this.t
    }

    set type(value) {
        this.t = value
        return this.t
    }

    get activator() {
        return this.a
    }

    set activator(value) {
        this.a = value
        return this.a
    }

    get rate() {
        return this.r
    }

    set rate(value) {
        this.r = value
        return this.r
    }

    get momentum() {
        return this.m
    }

    set momentum(value) {
        this.m = value
        return this.m
    }

    get iterations() {
        return this.i
    }

    set iterations(value) {
        this.i = value
        return this.i
    }

    get recurrentSteps() {
        return this.rs
    }

    set recurrentSteps(value) {
        this.rs = value
        return this.rs
    }

    get input() {
        return this.layers[0].n.map(neuron => neuron.input)
    }

    set input(input = []) {
        this.layers[0].n.forEach((neuron, index) => (neuron.input = input[index]))
        return this.input
    }

    get output() {
        return [...this.layers].pop().n.map(neuron => neuron.output)
    }

    getNeuron(id) {
        if (typeof id === "object") return id
        return this.neurons.find(neuron => neuron.id === Number(id))
    }

    initialize(config = {}) {
        this.l = [] // Layers.
        this.n = [] // Neurons.
        this.c = [] // Connections.
        this.t = config.t ?? config.type ?? "ff" // Network type, "ff" for feedforward, "neat" for NEAT.
        this.a = typeof config.a !== "undefined" ? config.a : typeof config.activator !== "undefined" ? config.activator : "sigmoid" // Activator (sigmoid/relu/tanh), used as default activator if no neuron/layer activator exists.
        this.r = config.r ?? config.rate ?? 0.01 // Learning rate, used in FF network.
        this.m = config.m ?? config.momentum ?? 0.01 // Momentum, used in FF network.
        this.i = config.i ?? config.iterations ?? 0 // Iterations, used in FF network.
        this.rs = config.rs ?? config.recurrentSteps ?? 2 // How many recurrent activation steps to run when delayed/recurrent edges exist.
        this.h = {} // Recurrent activation history by neuron id.
    }

    layer(config = {}) {
        if (Array.isArray(config) && config.length && config.every(item => !item["#"])) {
            config.forEach(item => this.layer(item))
            return this.connect()
        }
        const layer = new Layer(config)
        if (layer) {
            const index = !isNaN(config.i) ? Number(config.i) : !isNaN(config.index) ? Number(config.index) : this.l.length // Make sure 0 is also be assigned.
            this.l.splice(index, 0, layer)
            const neurons = config.n || config.neurons || config
            if (Number.isInteger(neurons)) for (let i = 0; i < neurons; i++) this.neuron({ layer })
        }
        return layer
    }

    neuron(config = {}) {
        if (Array.isArray(config)) return config.forEach(item => this.neuron(item))
        // Create neuron with or without given config.
        if (isNaN(config["#"]) && isNaN(config.id)) config.id = this.neurons.length
        const neuron = new Neuron(config)
        if (neuron) {
            if (typeof config.layer !== "undefined") {
                if (!isNaN(config.layer)) config.layer = this.layers[config.layer]
                config.layer.n.push(neuron)
            }
            this.n.push(neuron)
            return neuron
        }
    }

    connect(config = {}) {
        // If the given config is an array of connections.
        if (Array.isArray(config)) return config.forEach(item => this.connect(item))
        const explicitEndpoints = ["<", ">", "from", "to"].some(key => typeof config[key] !== "undefined")

        // If FROM and TO are string/number, try to get their relative neurons.
        if (!["undefined", "object"].includes(typeof config["<"])) config["<"] = this.getNeuron(config["<"])
        if (!["undefined", "object"].includes(typeof config[">"])) config[">"] = this.getNeuron(config[">"])
        if (!["undefined", "object"].includes(typeof config.from)) config.from = this.getNeuron(config.from)
        if (!["undefined", "object"].includes(typeof config.to)) config.to = this.getNeuron(config.to)

        const from = config["<"] || config.from || {}
        const to = config[">"] || config.to || {}

        // If FROM and TO are neurons.
        if (Array.isArray(from?.[">"]) && Array.isArray(to?.["<"]) && !this.connections.some(c => c.from.id === from.id && c.to.id === to.id)) {
            const connection = new Connection(config)
            return this.c.push(connection)
        }

        // If FROM and TO are layers.
        if (from.neurons?.length && to.neurons?.length) return from.neurons.forEach(_from => to.neurons.forEach(_to => this.connect({ from: _from, to: _to })))

        if (explicitEndpoints) return

        // If FROM and TO are not provided, connect each layer's neurons with its surrouding layers' neurons.
        let i
        this.layers.forEach((layer, index) => {
            if (!layer.neurons?.length) return
            if (this.layers[i]?.neurons?.length && layer?.neurons?.length && index > i) this.connect({ from: this.layers[i], to: layer })
            if (layer.neurons?.length) i = index
        })
    }

    train(input = [], output = []) {
        this.calculate(input)
        this.backpropagate(output)
        this.iterations++
    }

    clear(config = {}) {
        this.neurons.forEach(neuron => {
            neuron.input = 0
            neuron.output = undefined
        })
        if (config.history) this.resetState()
    }

    layerIndexes() {
        const indexes = {}
        this.layers.forEach((layer, index) => layer.n.forEach(neuron => (indexes[neuron.id] = index)))
        return indexes
    }

    isRecurrentConnection(connection, indexes = this.layerIndexes()) {
        return indexes[connection.from.id] >= indexes[connection.to.id]
    }

    maxDelay(indexes = this.layerIndexes()) {
        return this.connections.reduce((value, connection) => {
            if (!this.isRecurrentConnection(connection, indexes)) return value
            return Math.max(value, Math.max(1, Math.round(connection.timestep || 1)))
        }, 1)
    }

    hasRecurrentConnections(indexes = this.layerIndexes()) {
        return this.connections.some(connection => this.isRecurrentConnection(connection, indexes))
    }

    resetState() {
        const size = this.maxDelay()
        this.h = {}
        this.neurons.forEach(neuron => {
            this.h[neuron.id] = Array(size).fill(0)
        })
        return this.h
    }

    history(neuron, delay = 1) {
        const values = this.h?.[neuron.id] || []
        const index = values.length - Math.max(1, Math.round(delay))
        return values[index] || 0
    }

    step(input = [], config = {}) {
        const indexes = this.layerIndexes()
        if (config.reset) this.resetState()
        if (!Object.keys(this.h || {}).length) this.resetState()

        this.layers[0]?.n.forEach((neuron, index) => {
            neuron.input = input[index] ?? 0
        })

        this.layers.forEach((layer, index) =>
            layer.neurons.forEach(neuron => {
                if (index !== 0 || neuron.inputs.length) {
                    neuron.input = neuron.inputs.reduce((value, connection) => {
                        const source = this.isRecurrentConnection(connection, indexes) ? this.history(connection.from, connection.timestep) : connection.from.output || 0
                        return value + connection.weight * source
                    }, 0)
                }
                const activator = typeof neuron.activator !== "undefined" ? neuron.activator : typeof layer.activator !== "undefined" ? layer.activator : this.activator
                if (index === 0 && !neuron.inputs.length) neuron.output = neuron.input
                else neuron.output = this.activate(neuron, activator)
            })
        )

        const historySize = this.maxDelay(indexes)
        this.neurons.forEach(neuron => {
            if (!this.h[neuron.id]) this.h[neuron.id] = []
            this.h[neuron.id].push(neuron.output || 0)
            while (this.h[neuron.id].length > historySize) this.h[neuron.id].shift()
        })

        return this.output
    }

    calculate(input = [], config = {}) {
        const options = typeof config === "number" ? { steps: config } : config
        const indexes = this.layerIndexes()
        if (options.reset !== false) this.clear({ history: true })
        const steps = options.steps || (this.hasRecurrentConnections(indexes) ? Math.max(this.recurrentSteps, this.maxDelay(indexes)) : 1)
        let output = []
        for (let i = 0; i < steps; i++) output = this.step(input)
        return output
    }

    activate(neuron, activator) {
        if (activator === false) return neuron.input
        return activators[activator || this.activator](neuron.input + neuron.bias)
    }

    propagate() {
        return this.step(this.input)
    }

    backpropagate(target) {
        return [...this.layers].reverse().forEach((layer, i) =>
            layer.neurons.forEach((neuron, j) => {
                let error = 0
                if (i === 0) error = 2 * (neuron.output - target[j])
                else neuron.outputs.forEach(connection => (error += connection.to.delta * connection.weight))
                neuron.error = error
                const activator = neuron.activator || layer.activator || this.activator
                neuron.delta = error * derivatives[activator](neuron.output)
                neuron.inputs.forEach(connection => {
                    const change = this.rate * neuron.delta * connection.from.output + this.momentum * connection.change
                    connection.change = change
                    connection.weight -= change
                })
                neuron.bias -= this.rate * neuron.delta
            })
        )
    }

    encode(data = this) {
        if (Array.isArray(data)) return data.map(d => this.encode(d))
        if (typeof data === "object") {
            const result = {}
            // Reduce data, remove undefined properties.
            for (const key in data) if (data[key] === undefined) delete data[key]
            // If this is a layer, transform its array of neurons.
            if (Object.keys(data).length <= 2 && Array.isArray(data.n) && data.n.every(n => typeof n === "object")) result.n = data.n.map(neuron => neuron["#"])
            // If this is a layer without configs, just return its array of neurons.
            if (Object.keys(data).length === 1 && data.n) return result.n
            for (const key in data) {
                // Skip external keys.
                if (key.length > 1) continue
                // Skip keys with defined value that already exist in result.
                if (typeof result[key] !== "undefined") continue
                // Skip undefined data and empty array.
                if (data[key] === undefined || (Array.isArray(data[key]) && !data[key].length)) continue
                // If this is a neuron, ignore connection properties.
                if (data.inputs && data.outputs && (key === ">" || key === "<")) continue
                // If this is a connection, only return ids of "from" and "to" instead of full object.
                if (data.from && data.to && ["<", ">"].includes(key)) result[key] = data[key]["#"]
                else result[key] = this.encode(data[key])
            }
            return result
        }
        return data
    }

    decode(data = {}) {
        // Decode the whole network from given JSON data.
        if (typeof data === "string") {
            try {
                data = JSON.parse(data)
                if (typeof data !== "object") return
            } catch {}
        }
        // Reset network layers, neurons, connections.
        this.initialize()
        // Restore non-objective properties.
        for (const key in data) if (typeof data[key] !== "object") this[key] = data[key]
        // Restore network neurons.
        data.n.forEach(item => this.neuron({ ...item }))
        // Restore network layers.
        data.l.forEach(item => {
            if (Array.isArray(item)) item = { n: item }
            item.n = item.n.map(neuron => this.getNeuron(neuron))
            this.layer({ ...item })
        })
        // Restore network connections.
        data.c.forEach(item => this.connect({ ...item }))
        return this
    }

    encoded(data = {}) {
        // Check if data is encoded.
        if (typeof data === "string") return true
        if (data?.l?.some(l => Array.isArray(l) || typeof l?.n !== "number")) return true
        if (data?.n?.some(n => isNaN(n["<"]) && isNaN(n[">"]))) return true
        if (data?.c?.some(c => isNaN(c["<"]) || isNaN(c[">"]))) return true
        return false
    }
}

export default Network
