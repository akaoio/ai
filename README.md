# ai

Generic AI experimentation platform in JavaScript with optional Zig/WebAssembly acceleration for math-heavy kernels.

## What is in the repo

- `Network`, `Layer`, `Neuron`, `Connection`: graph-based neural primitives
- `Ecosystem`: evolutionary training loop for NEAT-style populations
- `Benchmark`: generic timing helpers
- `Wasm`: JS + Zig/WASM kernel bridge for dense math workloads

## Scripts

| Script                    | Purpose                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `npm test`                | Deterministic regression tests for feedforward learning and NEAT population invariants |
| `npm run testff`          | Legacy feedforward demo script                                                         |
| `npm run testneat -- XOR` | Legacy NEAT demo script                                                                |
| `npm run build:wasm`      | Compile Zig kernels to `wasm/kernels.wasm`                                             |
| `npm run benchmark`       | Build WASM and run measured JS vs WASM benchmarks                                      |

## Generic direction

The repository stays domain-agnostic on purpose. Nothing in the runtime is poker-specific, so the same platform can be used for:

- feedforward training
- evolutionary search
- self-play evaluators
- future task-specific agents built on top of the core primitives

## Zig + JS split

- Use JavaScript for orchestration, tooling, browser/server interoperability, and any path that can already rely on optimized JS runtimes.
- Use Zig/WebAssembly for portable kernels where we want predictable low-level performance and benchmarkable speedups.

Current WASM kernels:

- `dot_f32`
- `dense_relu_f32`

## Benchmarking

Benchmarks are included so performance discussions are measured from the repo itself rather than guessed.

```bash
npm run benchmark
```

This prints a table with total time, average latency, and throughput for the same kernels in pure JS and Zig/WASM.
