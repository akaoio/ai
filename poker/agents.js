import { evaluateFive, evaluateSeven } from "./evaluator.js"
import { randomFloat } from "../Utils.js"

const RANK_ORDER = "23456789TJQKA"

const rank = card => (card ? RANK_ORDER.indexOf(card[0]) + 2 : 0)
const suit = card => card?.[1]

const longestRun = (cards = []) => {
    const ranks = [...new Set(cards.map(rank).filter(Boolean))].sort((a, b) => a - b)
    if (ranks.includes(14)) ranks.unshift(1)
    let best = 0
    let current = 0
    for (let i = 0; i < ranks.length; i++) {
        if (i === 0 || ranks[i] === ranks[i - 1] + 1) current++
        else current = 1
        best = Math.max(best, current)
    }
    return best
}

const suitPressure = (cards = []) => {
    const counts = {}
    cards.forEach(card => {
        const key = suit(card)
        if (!key) return
        counts[key] = (counts[key] || 0) + 1
    })
    return Math.max(0, ...Object.values(counts))
}

const duplicatePressure = (cards = []) => {
    const counts = {}
    cards.forEach(card => {
        const key = card?.[0]
        if (!key) return
        counts[key] = (counts[key] || 0) + 1
    })
    return Math.max(0, ...Object.values(counts))
}

const boardPaired = community => duplicatePressure(community) >= 2 ? 1 : 0

export const currentHandStrength = (hole = [], community = []) => {
    const cards = [...hole, ...community].filter(Boolean)
    if (cards.length < 5) {
        const duplicate = duplicatePressure(cards)
        if (duplicate >= 4) return 7 / 8
        if (duplicate === 3) return 3 / 8
        if (duplicate === 2) return 1 / 8
        return 0
    }
    return (cards.length >= 7 ? evaluateSeven(cards) : evaluateFive(cards.slice(0, 5))).category / 8
}

const overcards = (hole = [], community = []) => {
    const boardHigh = Math.max(0, ...community.map(rank))
    if (!boardHigh) return 0
    return hole.filter(card => rank(card) > boardHigh).length / 2
}

// Estimate preflop hand strength from hole cards alone (no community)
const preflopStrength = (hole = []) => {
    if (hole.length < 2) return 0
    const [r1, r2] = hole.map(rank).sort((a, b) => b - a)
    const paired = r1 === r2
    const suited = hole[0]?.[1] === hole[1]?.[1]
    const gap = r1 - r2
    if (paired) return 0.35 + ((r1 - 2) / 12) * 0.65
    const highBonus = (r1 - 2) / 12
    const kicker = (r2 - 2) / 24
    const suitBonus = suited ? 0.08 : 0
    const connectBonus = Math.max(0, (5 - gap) / 5) * 0.07
    return Math.min(0.98, highBonus * 0.5 + kicker + suitBonus + connectBonus)
}

export const OBSERVATION_SIZE = 45

export class RandomAgent {
    constructor(config = {}) {
        this.id = config.id || "random"
    }

    act(context = {}) {
        const r = randomFloat(0, 1)
        const canCheck = context.legalActions.some(a => a.type === "check")
        const canCall = context.legalActions.some(a => a.type === "call")
        const canRaise = context.legalActions.some(a => a.type === "raise")
        // ~10% fold, ~15% raise, rest check/call
        if (!canCheck && r < 0.10) return { type: "fold" }
        if (canRaise && r < 0.15) return { type: "raise", amount: context.minRaiseTo }
        if (canCheck) return { type: "check" }
        if (canCall) return { type: "call" }
        return context.legalActions[0] || { type: "fold" }
    }
}

// Rule-based heuristic agent with realistic poker logic
export class HeuristicAgent {
    constructor(config = {}) {
        this.id = config.id || "heuristic"
        // style: "tight" | "loose" | "aggressive" | "balanced"
        this.style = config.style || "balanced"
    }

    act(context = {}) {
        const canCheck = context.legalActions.some(a => a.type === "check")
        const canCall = context.legalActions.some(a => a.type === "call")
        const canRaise = context.legalActions.some(a => a.type === "raise")
        const potOdds = context.toCall / Math.max(context.pot + context.toCall, 1)
        const isLate = context.relativePosition >= context.playerCount * 0.55
        const isButton = context.relativePosition === context.playerCount - 1

        // Preflop
        if (context.stageIndex === 0) {
            const strength = preflopStrength(context.hole)
            return this._preflopAction(context, strength, potOdds, isLate || isButton, canCheck, canCall, canRaise)
        }

        // Postflop
        const strength = currentHandStrength(context.hole, context.community)
        return this._postflopAction(context, strength, potOdds, canCheck, canCall, canRaise)
    }

    _preflopAction(context, strength, potOdds, isLate, canCheck, canCall, canRaise) {
        const tightThresh = this.style === "tight" ? 0.12 : this.style === "loose" ? 0.05 : 0.08
        const raiseThresh = this.style === "aggressive" ? 0.45 : this.style === "tight" ? 0.6 : 0.55

        if (strength >= raiseThresh && canRaise) {
            const amount = Math.min(context.maxRaiseTo, Math.max(context.minRaiseTo, context.bigBlind * 3))
            return { type: "raise", amount }
        }
        if (strength >= 0.4 && canRaise && (isLate || this.style === "aggressive")) {
            return { type: "raise", amount: context.minRaiseTo }
        }
        if (strength >= tightThresh) {
            if (canCheck) return { type: "check" }
            if (canCall && potOdds < 0.35) return { type: "call" }
        }
        if (canCheck) return { type: "check" }
        return { type: "fold" }
    }

    _postflopAction(context, strength, potOdds, canCheck, canCall, canRaise) {
        const spr = context.effectiveStack / Math.max(context.pot, context.bigBlind)
        const committed = (context.committedHand || 0) / Math.max(context.startingStack, 1)

        // Very strong hand: bet for value
        if (strength >= 6 / 8) {
            if (canRaise) {
                const betSize = context.pot * (this.style === "aggressive" ? 1.0 : 0.75)
                const amount = Math.min(context.maxRaiseTo, Math.max(context.minRaiseTo, context.currentBet + betSize))
                return { type: "raise", amount }
            }
            return canCall ? { type: "call" } : { type: "check" }
        }
        // Strong hand: bet or call
        if (strength >= 4 / 8) {
            if (canRaise && spr > 2) {
                const betSize = context.pot * 0.5
                const amount = Math.min(context.maxRaiseTo, Math.max(context.minRaiseTo, context.currentBet + betSize))
                return { type: "raise", amount }
            }
            if (canCheck) return { type: "check" }
            if (canCall && potOdds < 0.40) return { type: "call" }
            return { type: "fold" }
        }
        // Medium hand: check or call if cheap
        if (strength >= 2 / 8) {
            if (canCheck) return { type: "check" }
            if (canCall && potOdds < 0.25) return { type: "call" }
            // Pot-committed: call anyway
            if (canCall && committed > 0.35) return { type: "call" }
            return { type: "fold" }
        }
        // Weak hand: check or fold
        if (canCheck) return { type: "check" }
        // Bluff occasionally in aggressive style
        if (this.style === "aggressive" && canRaise && randomFloat(0, 1) < 0.15) {
            return { type: "raise", amount: context.minRaiseTo }
        }
        return { type: "fold" }
    }
}

export class ScriptedAgent {
    constructor(actions = []) {
        this.actions = [...actions]
    }

    act(context = {}) {
        return this.actions.shift() || (context.legalActions.some(action => action.type === "check") ? { type: "check" } : { type: "call" })
    }
}

export const encodeObservation = context => {
    const knownCards = [...context.hole, ...context.community]
    const ranks = knownCards.map(card => (card ? (rank(card) - 2) / 12 : 0))
    while (ranks.length < 7) ranks.push(0)
    const holeRanks = context.hole.map(rank).sort((a, b) => b - a)
    const rankGap = holeRanks.length === 2 ? Math.abs(holeRanks[0] - holeRanks[1]) / 12 : 0
    const toCallBase = Math.max(context.pot + context.toCall, context.bigBlind)
    const potOdds = context.toCall > 0 ? context.toCall / toCallBase : 0
    const effectiveStack = context.effectiveStack / Math.max(context.startingStack, 1)
    const spr = context.pot > 0 ? context.effectiveStack / context.pot : context.effectiveStack / Math.max(context.bigBlind, 1)
    const boardFlushPressure = suitPressure(context.community) / 5
    const totalFlushPressure = suitPressure(knownCards) / 7
    const boardStraightPressure = longestRun(context.community) / 5
    const totalStraightPressure = longestRun(knownCards) / 7
    const duplicateBoardPressure = duplicatePressure(context.community) / 4
    const duplicateTotalPressure = duplicatePressure(knownCards) / 4
    const potCommitment = (context.committedHand || 0) / Math.max(context.startingStack, 1)
    const betCommitment = context.currentBet / Math.max(context.pot + context.currentBet, context.bigBlind)
    return [
        context.stageIndex / 3,
        context.position / Math.max(context.playerCount - 1, 1),
        context.relativePosition / Math.max(context.playerCount - 1, 1),
        context.stack / Math.max(context.startingStack, 1),
        effectiveStack,
        context.toCall / Math.max(context.bigBlind, 1),
        context.pot / Math.max(context.bigBlind, 1),
        potOdds,
        Math.min(spr / 20, 1),
        context.activePlayers / Math.max(context.playerCount, 1),
        context.playersBehind / Math.max(context.playerCount - 1, 1),
        context.playersToAct / Math.max(context.playerCount - 1, 1),
        context.hole[0] && context.hole[1] ? (context.hole[0][1] === context.hole[1][1] ? 1 : 0) : 0,
        context.hole[0] && context.hole[1] ? (context.hole[0][0] === context.hole[1][0] ? 1 : 0) : 0,
        holeRanks[0] ? (holeRanks[0] - 2) / 12 : 0,
        holeRanks[1] ? (holeRanks[1] - 2) / 12 : 0,
        rankGap,
        context.community.length / 5,
        boardPaired(context.community),
        duplicateBoardPressure,
        boardFlushPressure,
        boardStraightPressure,
        duplicateTotalPressure,
        totalFlushPressure,
        totalStraightPressure,
        currentHandStrength(context.hole, context.community),
        overcards(context.hole, context.community),
        context.lastAggressorPosition >= 0 ? context.lastAggressorPosition / Math.max(context.playerCount - 1, 1) : 0,
        context.lastAggressorPosition === context.position ? 1 : 0,
        Math.min(context.stageActions / 12, 1),
        Math.min(context.stageRaises / 6, 1),
        Math.min(context.totalRaises / 12, 1),
        context.legalActions.some(action => action.type === "check") ? 1 : 0,
        context.legalActions.some(action => action.type === "call") ? 1 : 0,
        context.legalActions.some(action => action.type === "raise") ? 1 : 0,
        context.maxRaiseTo / Math.max(context.startingStack, 1),
        potCommitment,
        betCommitment,
        ...ranks
    ]
}

export const actionFromOutputs = (outputs = [], context = {}) => {
    const legal = new Map(context.legalActions.map(action => [action.type, action]))
    // 6 outputs: fold | check/call | raise-small(1/3pot) | raise-medium(2/3pot) | raise-large(pot) | all-in
    const potBet = amount => Math.min(context.maxRaiseTo, Math.max(context.minRaiseTo, context.currentBet + amount))
    const choices = [
        { type: "fold", score: outputs[0] ?? -Infinity },
        { type: legal.has("check") ? "check" : "call", score: outputs[1] ?? -Infinity },
        { type: "raise", score: outputs[2] ?? -Infinity, amount: potBet(Math.round(context.pot / 3)) },
        { type: "raise", score: outputs[3] ?? -Infinity, amount: potBet(Math.round(context.pot * 2 / 3)) },
        { type: "raise", score: outputs[4] ?? -Infinity, amount: potBet(context.pot) },
        { type: "all-in", score: outputs[5] ?? -Infinity }
    ]
    return choices
        .filter(choice => legal.has(choice.type) || choice.type === "all-in")
        .sort((a, b) => b.score - a.score)
        .map(choice => {
            if (choice.type === "all-in" && legal.has("raise")) return { type: "raise", amount: context.maxRaiseTo }
            return choice
        })[0] || { type: legal.has("check") ? "check" : "call" }
}

export const createNeatAgent = (network, config = {}) => ({
    id: config.id || "neat-agent",
    act(context = {}) {
        const input = (config.encodeObservation || encodeObservation)(context)
        const output = network.calculate(input, { reset: true, steps: config.steps || network.recurrentSteps || 1 })
        return actionFromOutputs(output, context)
    }
})

export default { RandomAgent, ScriptedAgent, HeuristicAgent, createNeatAgent, encodeObservation, actionFromOutputs, currentHandStrength }
