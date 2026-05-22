# 07 — Game Theory Optimal (GTO) Play

---

## The Concept

Game Theory Optimal poker is a strategy based on Nash Equilibrium theory. A Nash Equilibrium is a state where no player can improve their outcome by unilaterally changing their strategy, assuming all other players maintain their strategies. In poker, a GTO strategy cannot be exploited — it maximizes the floor of performance against any opponent strategy.

Against a perfectly GTO opponent, no strategy produces a positive result. The best any opponent can do is break even. This makes GTO a theoretically "safe" baseline.

---

## Balance

The core principle of GTO is balance. A balanced betting range contains both value hands (hands that want to be called) and bluffs (hands that want opponents to fold) in proportions that make opponents indifferent.

**The concept of indifference:**
If a bet makes an opponent indifferent, they gain neither by always calling nor by always folding. The EV of calling equals the EV of folding. At this point, the opponent's action becomes irrelevant to the bettor's EV — the bettor profits regardless.

This is achieved by calibrating the ratio of value hands to bluffs based on the bet size:

For a pot-sized bet, an opponent needs 50% equity to break even on a call.

- If a player's betting range contains 2 value hands for every 1 bluff, bluffs make up 33% of bets.
- A caller who always calls gains from calling the bluffs but loses to the value hands.
- A caller who always folds gives up the pot to both value hands and bluffs.
- The exact GTO ratio makes both outcomes equally losing for the caller.

---

## Bet Sizing and Polarization

GTO reasoning informs bet sizing decisions. Different bet sizes communicate different range compositions:

**Small bets (25–40% of pot):**
Typically used with a **merged range** — a wide range of medium-to-strong hands that all benefit from building the pot while not needing opponents to fold. A small bet offers poor pot odds to calls but extracts value from a wide range of calling hands.

**Medium bets (50–75% of pot):**
The most versatile size. Works well with both value hands and bluffs. Puts reasonable pressure on opponents while not committing excessive chips.

**Large bets (80–150%+ of pot):**
Typically used with a **polarized range** — a range consisting of very strong hands (which want a call) and complete bluffs (which need a fold). The large bet forces opponents into difficult decisions. Calling a large bet requires strong equity to justify. The ratio of bluffs to value hands must be carefully balanced to prevent easy exploitation.

**Overbets (150%+ of pot):**
Maximally polarizing. Used when a player's range has a significant nut advantage — they can hold very strong hands that their opponent cannot. The large risk creates maximum pressure but requires robust range construction to execute.

---

## Exploitative vs GTO Play

GTO play is theoretically unexploitable, but most real opponents are not GTO players. They make systematic errors:

- **Folding too much:** Some players fold whenever facing pressure, even with strong hands. Against these players, bluffing more frequently than GTO dictates is maximally profitable.
- **Calling too much:** Some players call any bet out of stubbornness or curiosity. Against these players, bluffing less and value betting thinner (with medium-strength hands) is maximally profitable.
- **Predictable patterns:** Some players always c-bet, or always check strong hands. Identifying and countering these patterns (checking raises against predictable c-bettors, for example) generates profit that GTO play leaves on the table.

The key insight: GTO play is optimal when opponents play optimally. Against non-optimal opponents, exploitative deviations from GTO produce higher expected profits. The difficulty lies in correctly identifying opponent tendencies and adjusting accordingly without being counter-exploited in return.

---

## Frequencies

GTO strategy is expressed in terms of action frequencies, not fixed rules. A hand is not always bet or always checked — it is bet a certain percentage of the time in a given situation.

This randomization (called **mixing**) serves two purposes:

1. It prevents opponents from reliably predicting your action based on your hand
2. It achieves the precise bluff-to-value ratios required for balance

In practice, human players approximate mixing using contextual factors (stack sizes, reads, recent history) rather than strict randomization. Agents and solvers implement mixing directly.
