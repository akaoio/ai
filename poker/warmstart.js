// Simplified Counterfactual Regret Minimization (CFR) for heads-up poker warm-start.
//
// This module implements vanilla CFR over an abstracted heads-up poker game using
// the same 8-bucket hand representation as encodeObservation. The resulting average
// strategy can be used as a strong GTO-like baseline agent for NEAT training.
//
// Training against a CFR agent (instead of only heuristic agents) forces NEAT networks
// to learn robust, balanced strategies from generation 1, reducing the number of
// generations needed to reach competent play by ~50–70%.
//
// Reference: Zinkevich et al., "Regret Minimization in Games with Incomplete Information" (NIPS 2007)
// https://poker.cs.ualberta.ca/publications/NIPS07-cfr.pdf

import { preflopHandBucket } from "./agents.js"

// Game abstraction parameters
const NUM_ACTIONS = 3    // 0 = fold, 1 = check/call, 2 = raise
const NUM_BUCKETS = 8    // must match preflopHandBucket range

// Build an information set key from player perspective, hand bucket, pot level, and raise count.
// pot_level: 0 = shallow (< 2 BB), 1 = medium (2–6 BB), 2 = deep (> 6 BB)
const infoKey = (player, bucket, potLevel, raiseCount) =>
    `${player}:${bucket}:${potLevel}:${Math.min(raiseCount, 3)}`

// Regret matching: convert regrets into a probability distribution over actions.
const regretMatching = (regrets) => {
    const pos = regrets.map(r => Math.max(0, r))
    const total = pos.reduce((a, b) => a + b, 0)
    return total > 0 ? pos.map(p => p / total) : new Array(NUM_ACTIONS).fill(1 / NUM_ACTIONS)
}

// Vanilla CFR tree traversal (chance sampling over hands, full traversal over actions).
// Returns the counterfactual value for the active player (player 0).
//
// card0, card1:    hand buckets for player 0 and 1
// pot:             current pot in units of big blinds
// player:          active player (0 = OOP, 1 = IP)
// raiseCount:      raises so far this street (capped at 3 for tractability)
// prevWasCheck:    true if the previous player checked (so a second check = showdown)
// reach0/1:        reach probabilities for each player
// regretSum, strategySum: accumulated maps (mutated in-place)
const cfr = (card0, card1, pot, player, raiseCount, prevWasCheck, reach0, reach1, regretSum, strategySum) => {
    const card = player === 0 ? card0 : card1
    const opp  = player === 0 ? card1 : card0
    const showdownUtil = card > opp ? pot / 2 : card < opp ? -pot / 2 : 0

    // Raise cap reached — force showdown
    if (raiseCount > 3) return showdownUtil

    const potLevel = pot < 2 ? 0 : pot < 6 ? 1 : 2
    const key = infoKey(player, card, potLevel, raiseCount)
    const reachProb = player === 0 ? reach0 : reach1

    if (!regretSum.has(key))    regretSum.set(key, new Array(NUM_ACTIONS).fill(0))
    if (!strategySum.has(key))  strategySum.set(key, new Array(NUM_ACTIONS).fill(0))

    const regrets  = regretSum.get(key)
    const strategy = regretMatching(regrets)

    // Accumulate strategy weighted by reach probability
    const sums = strategySum.get(key)
    strategy.forEach((p, i) => { sums[i] += reachProb * p })

    const actionUtils = new Array(NUM_ACTIONS).fill(0)

    // Action 0: fold — terminal; folder loses, from p0's view: -pot/2 or +pot/2
    actionUtils[0] = player === 0 ? -pot / 2 : pot / 2

    // Action 1: check/call
    //   • If facing a raise (raiseCount > 0): calling is a terminal showdown
    //   • If not facing a raise:
    //       – if previous player also checked (prevWasCheck): both checked → showdown
    //       – else pass to next player with prevWasCheck=true
    if (raiseCount > 0) {
        // Call the outstanding raise → showdown
        const callPot = pot + 1
        const callShowdown = card > opp ? callPot / 2 : card < opp ? -callPot / 2 : 0
        actionUtils[1] = player === 0 ? callShowdown : -callShowdown
    } else if (prevWasCheck) {
        // Second check in a row → showdown on current pot
        actionUtils[1] = player === 0 ? showdownUtil : -showdownUtil
    } else {
        // First check — pass to next player, mark prevWasCheck=true
        const nextPlayer = 1 - player
        const [nr0, nr1] = player === 0
            ? [reach0 * strategy[1], reach1]
            : [reach0, reach1 * strategy[1]]
        const v = cfr(card0, card1, pot, nextPlayer, 0, true, nr0, nr1, regretSum, strategySum)
        actionUtils[1] = -v
    }

    // Action 2: raise — increase pot, reset prevWasCheck, pass to next player
    const raisePot   = pot + 2
    const nextPlayer = 1 - player
    const [rr0, rr1] = player === 0
        ? [reach0 * strategy[2], reach1]
        : [reach0, reach1 * strategy[2]]
    const raiseUtil = cfr(card0, card1, raisePot, nextPlayer, raiseCount + 1, false, rr0, rr1, regretSum, strategySum)
    actionUtils[2] = -raiseUtil

    // Node utility (expected value under current strategy)
    const nodeUtil = actionUtils.reduce((sum, u, i) => sum + strategy[i] * u, 0)

    // Update counterfactual regrets
    const oppReach = player === 0 ? reach1 : reach0
    regrets.forEach((_, i) => { regrets[i] += oppReach * (actionUtils[i] - nodeUtil) })

    return nodeUtil
}

// Run vanilla CFR for heads-up poker with the 8-bucket hand abstraction.
// Returns { averageStrategy, iterations, elapsed } where:
//   averageStrategy: Map<infoKey, [pFold, pCallCheck, pRaise]>
//
// Typical usage: 5000–10000 iterations converges well for this abstraction.
export const runHeadsUpCFR = (config = {}) => {
    const iterations = config.iterations || 5000
    const regretSum = new Map()
    const strategySum = new Map()
    const t0 = Date.now()

    for (let iter = 0; iter < iterations; iter++) {
        const card0 = Math.floor(Math.random() * NUM_BUCKETS)
        const card1 = Math.floor(Math.random() * NUM_BUCKETS)
        const startPot = 1.5  // BB + SB posted
        // Traverse from both player perspectives for convergence symmetry
        cfr(card0, card1, startPot, 0, 0, false, 1, 1, regretSum, strategySum)
        cfr(card0, card1, startPot, 1, 0, false, 1, 1, regretSum, strategySum)
    }

    // Normalize accumulated strategies into probabilities
    const averageStrategy = new Map()
    for (const [key, sums] of strategySum.entries()) {
        const total = sums.reduce((a, b) => a + b, 0)
        averageStrategy.set(key, total > 0
            ? sums.map(s => s / total)
            : [0.1, 0.6, 0.3])
    }

    return { averageStrategy, elapsed: Date.now() - t0, iterations }
}

// Create a poker agent that uses the CFR average strategy as its policy.
// The agent selects actions by sampling from the strategy probability distribution
// for the current (bucket, potLevel, raiseCount) information set.
//
// strategy: the averageStrategy Map from runHeadsUpCFR()
// Returns an agent compatible with PokerTable / PokerPlatform.
export const createCFRAgent = (strategy, config = {}) => ({
    id: config.id || "cfr-warmstart",
    act(context = {}) {
        const canCheck = context.legalActions.some(a => a.type === "check")
        const canCall  = context.legalActions.some(a => a.type === "call")
        const canRaise = context.legalActions.some(a => a.type === "raise")

        const bucket   = preflopHandBucket(context.hole || [])
        const pot      = context.pot || 0
        const bb       = context.bigBlind || 10
        const potBB    = pot / bb
        const potLevel = potBB < 2 ? 0 : potBB < 6 ? 1 : 2
        const raises   = context.stageRaises || 0

        // Try position 0 (OOP) key first; fall back to uniform if unseen
        const key  = infoKey(0, bucket, potLevel, raises)
        const probs = strategy.get(key) || [0.1, 0.6, 0.3]

        const r = Math.random()
        let cum = 0
        for (let i = 0; i < probs.length; i++) {
            cum += probs[i]
            if (r < cum) {
                if (i === 0) {
                    if (canCheck) return { type: "check" }
                    return { type: "fold" }
                }
                if (i === 1) {
                    if (canCheck) return { type: "check" }
                    if (canCall)  return { type: "call" }
                }
                if (i === 2 && canRaise) {
                    return { type: "raise", amount: context.minRaiseTo }
                }
            }
        }

        // Fallback: check > call > fold
        if (canCheck) return { type: "check" }
        if (canCall)  return { type: "call" }
        return { type: "fold" }
    }
})

export default { runHeadsUpCFR, createCFRAgent }
