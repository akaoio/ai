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

    const copyFloat32 = values => {
        const typed = values instanceof Float32Array ? values : Float32Array.from(values)
        const pointer = Number(exports.alloc(typed.byteLength))
        if (!pointer) throw new Error("WASM allocator ran out of memory")
        new Float32Array(memory.buffer, pointer, typed.length).set(typed)
        return { pointer, length: typed.length }
    }

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
        }
    }
}

export default { jsKernels, loadWasmKernels }
