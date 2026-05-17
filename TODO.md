NEAT ALGO

- Until all the outputs are active
    - for all non-sensor nodes
        - activate node
        - sum the input
    - for all non-sensor and active nodes
        - calculate the output
- Baseline fixes landed:
    - deterministic test entrypoint via `npm test`
    - canonical innovation-number based `speciate()`, `produce()`, and `crossover()`
    - deterministic split history for add-node mutation
    - safer `mutate()` defaults for feedforward NEAT
- Why NEAT still needs more work:
    - benchmark coverage should expand beyond kernel-level tests
    - recurrent tasks need broader benchmark/evaluation suites than XOR-style sanity checks

TODOS:

- add innovation tracking for node/connection genes.
- benchmark full-network propagation/training loops, not just kernels.
- connect(): support configurable zero-initialized connection weights when wanted.
- Implement neural network topology visualization.
