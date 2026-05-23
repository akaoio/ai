import { readFile } from "fs/promises"
import { fileURLToPath } from "url"

export const jsKernels = {
    dot(left = [], right = []) {
        let sum = 0
        for (let i = 0; i < left.length; i++) sum += left[i] * right[i]
        return sum
    },
    denseRelu(inputs = [], weights = [], biases = [], inputSize = inputs.length, outputSize = biases.length) {
        const output = new Float32Array(outputSize)
        for (let o = 0; o < outputSize; o++) {
            let value = biases[o] || 0
            const offset = o * inputSize
            for (let i = 0; i < inputSize; i++) value += inputs[i] * weights[offset + i]
            output[o] = Math.max(0, value)
        }
        return output
    }
}

const wasmSource = new URL("./wasm/kernels.wasm", import.meta.url)

const toBytes = async source => {
    if (source instanceof Uint8Array) return source
    if (source instanceof URL) return readFile(fileURLToPath(source))
    return readFile(source)
}

export const loadWasmKernels = async ({ source = wasmSource } = {}) => {
    const module = await WebAssembly.instantiate(await toBytes(source))
    const { exports } = module.instance
    const memory = exports.memory

    const copyTyped = (Ctor, values) => {
        const typed = values instanceof Ctor ? values : Ctor.from(values)
        const pointer = Number(exports.alloc(typed.byteLength))
        if (!pointer) throw new Error("WASM allocator ran out of memory")
        new Ctor(memory.buffer, pointer, typed.length).set(typed)
        return { pointer, length: typed.length }
    }

    const copyFloat32 = v => copyTyped(Float32Array, v)
    const copyUint32 = v => copyTyped(Uint32Array, v)
    const copyInt32 = v => copyTyped(Int32Array, v)
    const copyInt8 = v => copyTyped(Int8Array, v)
    const copyUint8 = v => copyTyped(Uint8Array, v)

    // Tracks output count set by the last neatLoad call
    let _neatOc = 0

    return {
        dot(left = [], right = []) {
            exports.reset_alloc()
            const a = copyFloat32(left)
            const b = copyFloat32(right)
            return exports.dot_f32(a.pointer, b.pointer, a.length)
        },
        denseRelu(inputs = [], weights = [], biases = [], inputSize = inputs.length, outputSize = biases.length) {
            exports.reset_alloc()
            const input = copyFloat32(inputs)
            const kernel = copyFloat32(weights)
            const bias = copyFloat32(biases)
            const outputPointer = Number(exports.alloc(outputSize * Float32Array.BYTES_PER_ELEMENT))
            exports.dense_relu_f32(input.pointer, kernel.pointer, bias.pointer, outputPointer, inputSize, outputSize)
            return new Float32Array(memory.buffer.slice(outputPointer, outputPointer + outputSize * Float32Array.BYTES_PER_ELEMENT))
        },

        // Load a compiled NEAT network into static WASM buffers.
        // All arrays must be pre-built by Network.compile(); this just copies them.
        neatLoad({ neuronCount, inputCount, outputCount, historyDepth, layerOrder, biases, csrStarts, connFrom, connWeight, connTimestep, outputIndices }) {
            _neatOc = outputCount
            exports.reset_alloc()
            const lo = copyUint32(layerOrder)
            const b = copyFloat32(biases)
            const cs = copyInt32(csrStarts)
            const cf = copyUint32(connFrom)
            const cw = copyInt8(connWeight)
            const ct = copyUint8(connTimestep)
            const oi = copyUint32(outputIndices)
            exports.neat_load(neuronCount, layerOrder.length, inputCount, outputCount, historyDepth, connFrom.length, lo.pointer, b.pointer, cs.pointer, cf.pointer, cw.pointer, ct.pointer, oi.pointer)
            exports.reset_alloc()
        },

        // Reset activation state and history (call before each new episode/hand).
        neatReset() {
            exports.neat_reset()
        },

        // Run one forward step and return output activations as a plain Array.
        neatStep(inputs) {
            exports.reset_alloc()
            const inp = copyFloat32(inputs)
            const outPtr = Number(exports.alloc(_neatOc * 4))
            exports.neat_step(inp.pointer, outPtr)
            const result = Array.from(new Float32Array(memory.buffer, outPtr, _neatOc))
            exports.reset_alloc()
            return result
        },
    }
}

export default { jsKernels, loadWasmKernels }
