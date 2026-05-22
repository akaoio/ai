# 05 — Core Strategic Concepts

---

## Pot Odds

Pot odds quantify the economic justification for calling a bet. They express the ratio between the amount required to call and the total pot if the call is made.

> **Pot odds = call amount / (pot size + call amount)**

This gives a percentage that represents the minimum equity (probability of winning) required to break even on the call over many repetitions.

**Example:**

- Pot = 100, bet to call = 50
- Pot odds = 50 / (100 + 50) = 50 / 150 = 33.3%

This means if you win the hand at least 33.3% of the time when you call and your hand goes to showdown, the call has zero or positive expected value.

If your actual equity is 40%, the call is profitable. If your actual equity is 25%, the call loses money in the long run.

Pot odds are the foundation of all calling decisions. Any call made without considering pot odds is based on feel rather than math, and feel is unreliable across large sample sizes.

---

## Implied Odds

Implied odds extend pot odds to account for chips that can be won in future betting rounds if you complete your drawing hand. They justify calls that appear mathematically incorrect based on current pot odds alone.

**Example:**
You hold a flush draw with 9 outs and roughly 19% equity on the turn. The pot is 80 and the bet is 60, giving pot odds of approximately 43% required equity. The raw call appears losing. However, if you complete your flush on the river and your opponent will pay off a large bet, the extra chips you expect to win in future rounds can make the call profitable when factored in.

Implied odds are harder to quantify than pot odds because they rely on reads and assumptions about future opponent behavior. Key factors that increase implied odds:

- Deep stacks relative to the pot (more chips to win)
- Opponent tendencies to call large bets (paying off draws)
- Disguised draws (opponent unlikely to suspect your hand)

Key factors that decrease implied odds:

- Shallow stacks
- Opponents who fold to river bets
- Draws that are obvious from the board (e.g., four cards to a flush showing)

---

## Equity

Equity is a player's probabilistic share of the pot based on the likelihood of their hand winning at showdown. It is expressed as a percentage and calculated from the cards remaining in the deck.

A hand with 60% equity against one opponent will win roughly 60% of the time when both hands are played to showdown. This is a statistical expectation over many trials, not a guarantee in any single hand.

**Common equity benchmarks:**

- Pair versus undercards (e.g., A-A vs K-Q offsuit): approximately 65% vs 35%
- Pair versus live overcards (coin flip, e.g., J-J vs A-K): approximately 53% vs 47%
- Flush draw on the flop against top pair: approximately 35% vs 65%
- Open-ended straight draw on the flop: approximately 32% equity to complete by the river

Equity shifts significantly with each community card dealt. A player can have 70% equity on the flop and watch it collapse to 20% after a bad turn card. This is called being "outdrawn" or "sucked out on."

---

## The Rule of 2 and 4

A fast mental shortcut for estimating equity from outs:

- On the **flop** (two cards to come): multiply outs by **4** for approximate percentage equity
- On the **turn** (one card to come): multiply outs by **2** for approximate percentage equity

**Example:** You have a flush draw — 9 outs.

- Flop: 9 × 4 = 36% (actual: ~35%)
- Turn: 9 × 2 = 18% (actual: ~19%)

This rule is a fast approximation. It slightly overestimates equity at higher out counts (12+) but is accurate enough for in-hand decision making.

---

## Counting Outs

Outs are the specific cards remaining in the deck that will improve an incomplete hand to a winning hand.

**Common out counts:**

| Draw | Outs |
|------|------|
| Flush draw (9 cards of suit remain) | 9 |
| Open-ended straight draw | 8 |
| Gutshot straight draw | 4 |
| Two overcards against a pair | 6 |
| Pair needing a set | 2 |
| Full house draw with trips | 7 (pair the board + matching kickers) |

Outs must be counted carefully. A flush draw that also gives an opponent a full house if it completes provides fewer **clean** outs than the raw count suggests. Discounting outs for cards that complete the draw but also improve an opponent's hand is essential for accurate equity estimation.

---

## Expected Value (EV)

Expected value is the average monetary result of an action repeated over a theoretically infinite number of identical situations. It is the single most important concept for evaluating whether any poker decision is correct.

> **EV = (P(win) × amount won) − (P(lose) × amount lost)**

**Example — a river call:**

- Pot = 200, bet = 100, total pot if called = 300
- You estimate opponent is bluffing 40% of the time
- EV of calling = (0.40 × 200) − (0.60 × 100) = 80 − 60 = +20

The call has +20 EV — on average, it wins 20 chips per occurrence. Even though you lose the call 60% of the time, the times you win (collecting 200) outweigh the losses (paying 100).

EV thinking removes emotion from decision-making. A call can be correct even when it loses. A fold can be correct even when it would have won. What matters is the expected result over many repetitions.

---

## Stack-to-Pot Ratio (SPR)

SPR measures the depth of the effective stack relative to the size of the current pot. It answers the question: how many pot-sized bets remain before someone is all-in?

> **SPR = effective stack / current pot size**

The effective stack is the smaller of the two stacks in a heads-up situation (since you cannot win more than your opponent has).

**SPR categories and their implications:**

**Low SPR (1–4):**
Stacks are shallow relative to the pot. Both players are close to commitment. Top pair, strong two pair, and sets are generally played for stacks. Complex multi-street maneuvering has limited value because there is not enough money behind to warrant it. Draws become less attractive because pot odds are often too poor and implied odds are minimal.

**Medium SPR (4–13):**
The most common postflop scenario. There is enough money behind for several streets of betting. Top pair with a good kicker is strong but not necessarily worth playing for stacks. Draws can be played more freely because there is room to realize implied odds. Bluffing has more room to operate because folds justify the investment across multiple streets.

**High SPR (13+):**
Deep stacks create complex situations. Marginal made hands (top pair, even two pair) become more dangerous because opponents have enough chips to represent strong hands credibly, and losing a deep-stacked pot is very expensive. Premium holdings (sets, straights, flushes) become more valuable because they can extract large amounts across several streets. Speculative hands (small pairs hoping to flop sets, suited connectors hoping to flop draws or two pair) gain value because the implied odds when they hit are enormous.

---

## Continuation Betting

A continuation bet (c-bet) is a bet made on the flop by the player who was the last aggressor preflop (the raiser). It continues the story of a strong hand established preflop, regardless of whether the preflop raiser's hand actually improved.

C-bets are profitable as a baseline because:

- The preflop raiser's range is perceived as strong by opponents
- Most flops miss most hands — statistically, each player connects meaningfully with the flop approximately one-third of the time or less
- Opponents frequently fold to a bet even when they have weak pairs or draws

However, c-betting blindly every flop is exploitable. Board texture, opponent tendencies, and range advantage all determine when a c-bet is correct.

**C-betting is stronger when:**

- The board is dry and favors the preflop raiser's range (e.g., K-7-2 rainbow benefits the raiser who represents strong kings)
- Opponents have shown weakness (e.g., checked the flop)
- There are few draws available (no flush or straight draws)

**C-betting is weaker when:**

- The board is wet and favors the caller's range (e.g., 8-7-6 with two suited cards benefits hands like suited connectors the caller would have)
- Multiple opponents remain (each additional player decreases fold equity)
- The preflop raiser has a weak range (small blind vs big blind, for example)

---

## Aggression and Initiative

Aggression in poker means betting and raising rather than checking and calling. Aggressive play has a structural advantage: it creates two ways to win the pot.

1. All opponents fold immediately (winning without needing the best hand)
2. The aggressor's hand is best at showdown

Passive play — checking and calling — creates only one way to win: having the best hand at showdown. It surrenders initiative and allows opponents to control the narrative of the hand.

**Why initiative matters:**
The player who last raised has a perceived strong range. When they bet again on a later street, opponents must credit them with a credible strong hand. Checking back (not betting) on a street is often read as weakness. Consequently, the player who bet last can often push opponents off hands with continued aggression.

This is why **betting for protection** is a valid concept even with strong hands — not only does it build the pot, it also prevents opponents from drawing cheaply.

---

## Ranges, Not Hands

One of the most important conceptual shifts in poker thinking is moving from "what does my opponent have?" to "what range of hands might my opponent have?"

Because hole cards are hidden, no player can know with certainty what an opponent holds. However, every action — the position a player raised from, the size of their bet, whether they called or three-bet, the number of streets they have bet — narrows the range of plausible holdings.

**Range construction example:**
A player raises from early position preflop. Their range is narrow: likely premium hands (A-A, K-K, Q-Q, J-J, A-K, A-Q) and some strong suited connectors. A player who limps from the small blind and calls a raise might have a wider, more speculative range.

When this early-position raiser bets large on a K-7-2 rainbow flop, their range hits that board extremely well (kings, two pair, sets). The caller's range mostly misses. Good play accounts for this range advantage.

**Ranges and bluff catching:**
If a player always bets their strong hands and never bets weak ones, their betting range becomes unbalanced — opponents can profitably fold everything except their best hands. Conversely, if a player bluffs too often, opponents can profitably call with wide ranges. A balanced range makes opponents indifferent and prevents exploitation.

---

## Blockers and Unblockers

A blocker is a card in a player's hand that reduces the number of combinations of a specific holding the opponent can have. An unblocker is the inverse — a card that leaves the opponent's range of strong hands fully intact.

Because a standard deck has four of each card, holding one copy of a card means only three remain for opponents. This shifts the probability distribution of opponent holdings in ways that can be deliberately exploited.

**Blockers in practice:**

Holding the A♠ on a three-spade board means the opponent cannot hold the nut flush (which requires the A♠). The probability they have the strongest possible hand is reduced. This makes a bluff more likely to succeed and a fold less likely to be correct.

Holding a K before a 4-bet means the opponent is less likely to hold K-K — one of the combinations most likely to 4-bet for value. A 3-bet bluff with a hand containing a king is therefore more likely to succeed than a 3-bet bluff without one.

**Unblockers in practice:**

Unblockers are most relevant on the river when deciding whether to bluff-catch (call a bet). If a player holds cards that do *not* block the opponent's bluffing range — meaning the opponent can hold all their bluff combinations in full — calling becomes more attractive. The opponent has the maximum number of bluff combinations available, which improves the caller's pot odds justification.

Example: on a board where the main draws were spades, holding no spades means all flush draw combinations remain available to the opponent. Their range contains the maximum number of missed draws, which are now bluffs. Calling with an unblocker is correct more often than calling with a blocker to those same draws.

**The key principle:**

When bluffing, prefer hands that block the opponent's strong calling hands. When calling, prefer hands that unblock the opponent's bluffing hands. This is a refinement of range thinking — not a replacement for equity and pot odds, but an additional filter when selecting which specific hands within a range to use for a given action.
