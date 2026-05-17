const now = () => {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now()
    return Number(process.hrtime.bigint()) / 1e6
}

export const benchmark = async ({ name, fn, iterations = 1000, warmup = 100 }) => {
    for (let i = 0; i < warmup; i++) await fn(i)
    const start = now()
    let result
    for (let i = 0; i < iterations; i++) result = await fn(i)
    const totalMs = now() - start
    return {
        name,
        iterations,
        totalMs,
        averageMs: totalMs / iterations,
        opsPerSecond: iterations / (totalMs / 1000),
        result
    }
}

export const roundBenchmark = result => ({
    NAME: result.name,
    ITERATIONS: result.iterations,
    TOTAL_MS: Number(result.totalMs.toFixed(3)),
    AVG_MS: Number(result.averageMs.toFixed(6)),
    OPS_PER_SEC: Number(result.opsPerSecond.toFixed(2))
})

export default { benchmark, roundBenchmark }
