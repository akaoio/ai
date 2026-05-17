import { evaluateFive, evaluateSeven } from "./evaluator.js"

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

const currentHandStrength = (hole = [], community = []) => {
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

export const OBSERVATION_SIZE = 43

export class RandomAgent {
    constructor(config = {}) {
        this.id = config.id || "random"
    }

    act(context = {}) {
        if (context.legalActions.some(action => action.type === "check")) return { type: "check" }
        if (context.legalActions.some(action => action.type === "call")) return { type: "call" }
        return context.legalActions[0] || { type: "fold" }
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
        ...ranks
    ]
}

export const actionFromOutputs = (outputs = [], context = {}) => {
    const legal = new Map(context.legalActions.map(action => [action.type, action]))
    const choices = [
        { type: "fold", score: outputs[0] ?? -Infinity },
        { type: legal.has("check") ? "check" : "call", score: outputs[1] ?? -Infinity },
        { type: "raise", score: outputs[2] ?? -Infinity, amount: context.minRaiseTo },
        { type: "raise", score: outputs[3] ?? -Infinity, amount: Math.min(context.maxRaiseTo, Math.max(context.minRaiseTo, context.currentBet + context.pot)) },
        { type: "all-in", score: outputs[4] ?? -Infinity }
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

export default { RandomAgent, ScriptedAgent, createNeatAgent, encodeObservation, actionFromOutputs }
