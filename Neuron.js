import { uid, random } from "./Utils.js"

class Neuron {
    constructor(config = {}) {
        this["#"] = !isNaN(config["#"]) ? Number(config["#"]) : !isNaN(config.id) ? Number(config.id) : uid() // Unique ID. Make sure 0 is also be assigned.
        this["<"] = config["<"] || config.inputs || [] // Incoming connections.
        this[">"] = config[">"] || config.outputs || [] // Outcoming connections.
        this.a = typeof config.a !== "undefined" ? config.a : typeof config.activator !== "undefined" ? config.activator : undefined // Activator, replace layer/network activator.
        this.b = !isNaN(config.b) ? Number(config.b) : !isNaN(config.bias) ? Number(config.bias) : random(-1, 1) // Bias. Make sure 0 is also be assigned.
        this.i = config.i ?? config.input ?? 0 // Input.
        this.o = config.o ?? config.output ?? 0 // Output.
        this.e = config.e ?? config.error ?? 0 // Error, used in backpropagation.
        this.d = config.d ?? config.delta ?? 0 // Delta, used in backpropagation.
        this.s = typeof config.s !== "undefined" ? config.s : typeof config.state !== "undefined" ? config.state : true // State, used in NEAT network, true for ACTIVE, and false for INACTIVE.
        this.k = config.k || config.kind // Gene kind, used in canonical NEAT to identify input/hidden/output nodes.
        this.p = !isNaN(config.p) ? Number(config.p) : !isNaN(config.position) ? Number(config.position) : undefined // Layer position, used to rebuild feedforward phenotypes.
    }

    get id() {
        return this["#"]
    }

    get inputs() {
        return this["<"].filter(c => c.state && c.from.state)
    }

    set inputs(value) {
        this["<"] = value
        return this["<"]
    }

    get outputs() {
        return this[">"].filter(c => c.state && c.to.state)
    }

    set outputs(value) {
        this[">"] = value
        return this[">"]
    }

    get bias() {
        return this.b
    }

    set bias(value) {
        this.b = value
        return this.b
    }

    get input() {
        return this.inputs.reduce((value, connection) => (value += connection.weight * (connection.from.output || 0)), 0) || this.i
    }

    set input(value) {
        this.i = value
        return this.i
    }

    get output() {
        return this.state ? this.o : 0 // If neuron is INACTIVE, always return 0.
    }

    set output(value) {
        this.o = value
        return this.o
    }

    get error() {
        return this.e
    }

    set error(value) {
        this.e = value
        return this.e
    }

    get delta() {
        return this.d
    }

    set delta(value) {
        this.d = value
        return this.d
    }

    get state() {
        return this.s
    }

    set state(value) {
        this.s = value
        return this.s
    }

    get activator() {
        return this.a
    }

    set activator(value) {
        this.a = value
        return this.a
    }

    get kind() {
        return this.k
    }

    set kind(value) {
        this.k = value
        return this.k
    }

    get position() {
        return this.p
    }

    set position(value) {
        this.p = value
        return this.p
    }
}

export default Neuron
