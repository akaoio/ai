NEAT ALGO

- Until all the outputs are active
    - for all non-sensor nodes
        - activate node
        - sum the input
    - for all non-sensor and active nodes
        - calculate the output
- Baseline fixes landed:
    - deterministic test entrypoint via `npm test`
    - improved `Ecosystem.speciate()`
    - improved `Ecosystem.produce()`
    - safer `mutate()` defaults for feedforward NEAT
- Why NEAT still needs more work:
    - innovation-number based crossover/speciation is still missing
    - recurrent topology is still not a reliable target
    - benchmark coverage should expand beyond kernel-level tests

TODOS:

- add innovation tracking for node/connection genes.
- benchmark full-network propagation/training loops, not just kernels.
- connect(): support configurable zero-initialized connection weights when wanted.
- Implement neural network topology visualization.
