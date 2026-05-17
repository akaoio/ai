import { benchmark, roundBenchmark } from "../Benchmark.js"
import { jsKernels, loadWasmKernels } from "../Wasm.js"
import { setSeed, randomFloat } from "../Utils.js"

const makeVector = size => Float32Array.from({ length: size }, () => randomFloat(-1, 1))

const main = async () => {
    setSeed(2026)

    const inputSize = 128
    const outputSize = 64
    const left = makeVector(2048)
    const right = makeVector(2048)
    const inputs = makeVector(inputSize)
    const weights = makeVector(inputSize * outputSize)
    const biases = makeVector(outputSize)
    const wasm = await loadWasmKernels()

    const results = []
    results.push(await benchmark({ name: "js-dot-f32", iterations: 20000, warmup: 500, fn: () => jsKernels.dot(left, right) }))
    results.push(await benchmark({ name: "wasm-dot-f32", iterations: 20000, warmup: 500, fn: () => wasm.dot(left, right) }))
    results.push(await benchmark({ name: "js-dense-relu", iterations: 15000, warmup: 250, fn: () => jsKernels.denseRelu(inputs, weights, biases, inputSize, outputSize) }))
    results.push(await benchmark({ name: "wasm-dense-relu", iterations: 15000, warmup: 250, fn: () => wasm.denseRelu(inputs, weights, biases, inputSize, outputSize) }))

    console.table(results.map(roundBenchmark))
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
