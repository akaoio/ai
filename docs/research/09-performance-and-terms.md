# 09 — Performance Measurement and Common Terms

---

## BB/100

The standard metric for poker performance is **big blinds won per 100 hands**, written as BB/100.

> **BB/100 = (total chips won / big blind size) / total hands played × 100**

This normalizes winnings across different stake levels, session lengths, and player counts. It allows direct comparison between players, strategies, and sessions.

**Reference benchmarks:**

- **0 BB/100**: breaking even — not losing, not winning
- **1–3 BB/100**: small winner — modest but sustainable profit over large samples
- **5–10 BB/100**: strong winner at a given stake level
- **10+ BB/100**: exceptional — typical only at smaller stakes or under highly exploitable conditions

BB/100 requires large sample sizes to be statistically meaningful. Short-term results contain significant variance (luck). Over fewer than 10,000 hands, even a strong player can show a large negative BB/100 purely due to variance. At 100,000 hands, the signal becomes substantially more reliable.

---

## Winrate vs Variance

A player or agent can have a positive expected winrate but still experience significant losing periods due to variance — the unavoidable randomness in outcomes when cards are involved. This is not a sign of poor strategy; it is an inherent property of probabilistic games.

Key variance contributors:

- Getting all-in as a 70% favorite and losing (the 30% outcome occurs regularly)
- Running draws multiple times and missing
- Opponents making improbable calls with weak hands that happen to win

Managing variance without compromising strategy requires accepting losing outcomes that were statistically correct decisions. Adjusting strategy to avoid losing situations that are actually +EV is one of the most common and damaging errors.

---

## Common Poker Terms

| Term | Meaning |
|------|---------|
| **BB** | Big blind — the larger of the two forced bets; also used as the unit of measurement |
| **BTN** | Button — the dealer position; acts last on all postflop streets |
| **SB** | Small blind — forced bet from the player left of the button |
| **UTG** | Under the gun — first to act preflop; earliest and weakest position |
| **CO** | Cutoff — one seat to the right of the button; second strongest position |
| **HJ** | Hijack — two seats to the right of the button |
| **MP** | Middle position — between early and late position |
| **Outs** | Remaining deck cards that complete a drawing hand |
| **Drawing hand** | An incomplete hand that needs specific cards to become strong |
| **Made hand** | A complete hand that does not require improvement |
| **Nuts** | The absolute best possible hand given the current board |
| **Near-nuts** | A hand very close to the best possible; unlikely to be beaten |
| **Air** | A hand with no strength, no draw, and no showdown value — a bluffing hand |
| **Donk bet** | A bet out of position into the preflop aggressor |
| **Check-raise** | Check, then raise after an opponent bets — typically strong or semi-bluff |
| **Polarized range** | A betting range consisting of very strong hands and bluffs; nothing medium |
| **Merged range** | A betting range of a wide spectrum of medium-to-strong hands |
| **Slow play** | Checking or calling with a very strong hand to conceal its strength |
| **Overbet** | A bet exceeding the current pot size; highly polarizing |
| **Wet board** | A board with many possible draws (flush draws, straight draws, or both) |
| **Dry board** | A board with few or no draws; safe for strong hands |
| **Rainbow** | Three or more community cards all of different suits — no flush draw possible |
| **Monotone** | Three or more community cards all of the same suit |
| **Two-tone** | Exactly two community cards of the same suit — one-card flush draw possible |
| **Equity** | A player's statistical share of the pot based on probability of winning |
| **EV** | Expected value — the average result of an action over many repetitions |
| **GTO** | Game Theory Optimal — a Nash Equilibrium strategy that cannot be exploited |
| **SPR** | Stack-to-pot ratio — effective stack divided by current pot size |
| **C-bet** | Continuation bet — a bet made by the preflop aggressor on the flop |
| **3-bet** | A re-raise preflop (or third bet on any street) |
| **4-bet** | A re-raise of a three-bet |
| **Squeeze** | A three-bet when there is a raiser and one or more flat callers |
| **Range** | The full set of hands a player might hold in a given situation |
| **Range advantage** | When one player's range connects better with the board than their opponent's |
| **Nut advantage** | When one player's range contains more very strong hands than the opponent's |
| **Blocker** | A card in your hand that reduces the probability your opponent holds a specific hand |
| **Cooler** | A situation where two strong hands collide and the losing player had little choice but to go broke |
| **Bad beat** | Losing a hand as a heavy favorite due to an unlikely draw completing |
| **Tilt** | Emotional state following losses that causes irrational decision-making |
| **BB/100** | Big blinds won per 100 hands — the standard performance metric |
| **Runout** | The sequence of remaining community cards to be dealt |
| **Pot** | The total chips committed to the current hand by all players |
| **Rake** | A fee taken by the house from each pot — not relevant in self-play simulation |
