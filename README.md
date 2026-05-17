# ai

Generic AI experimentation platform in JavaScript with optional Zig/WebAssembly acceleration for math-heavy kernels.

## What is in the repo

- `Network`, `Layer`, `Neuron`, `Connection`: graph-based neural primitives
- `Ecosystem`: canonical feedforward NEAT evolution loop with innovation tracking
- `Benchmark`: generic timing helpers
- `Wasm`: JS + Zig/WASM kernel bridge for dense math workloads
- `poker/`: Texas Hold'em style self-play simulation platform for evolving agents

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

The new `poker/` folder is one example domain package built on top of the generic primitives. It provides:

- multi-player table simulation
- showdown evaluation
- chip-delta tournament aggregation
- agent adapters, including a simple NEAT adapter

The default NEAT poker encoder now uses a richer **43-feature** observation vector with:

- stage, seat, relative position, players behind/to act
- stack, effective stack, SPR, pot odds, to-call, raise bounds
- hole-card structure
- board texture and draw pressure
- current made-hand strength proxy
- last aggressor and short action-history counters

For wiring NEAT populations directly into poker self-play, see:

- `poker/neat.js`
- `poker/example.js`

For long-running evolution with automatic generation checkpoints on disk, run:

```bash
node poker/evolve.js 25
```

By default this writes generation JSON checkpoints under `poker/checkpoints/`.

## Canonical NEAT notes

The current NEAT path now uses:

- historical connection innovation numbers
- deterministic node-split history for add-node mutations
- compatibility distance based on excess, disjoint, and matching genes
- crossover aligned by innovation numbers instead of raw from/to matching
- recurrent/self connections with delayed state via `step()` / `calculate(..., { steps })`

Feedforward and recurrent canonical NEAT now share the same innovation-tracked genetics. Recurrent evaluation uses delayed state buffers, while feedforward use stays compatible with the existing API.

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
