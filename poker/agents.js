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
    const ranks = [...context.hole, ...context.community].map(card => (card ? "23456789TJQKA".indexOf(card[0]) / 12 : 0))
    while (ranks.length < 7) ranks.push(0)
    return [
        context.stageIndex / 3,
        context.position / Math.max(context.playerCount - 1, 1),
        context.stack / Math.max(context.startingStack, 1),
        context.toCall / Math.max(context.bigBlind, 1),
        context.pot / Math.max(context.bigBlind, 1),
        context.activePlayers / Math.max(context.playerCount, 1),
        context.hole[0] && context.hole[1] ? (context.hole[0][1] === context.hole[1][1] ? 1 : 0) : 0,
        context.hole[0] && context.hole[1] ? (context.hole[0][0] === context.hole[1][0] ? 1 : 0) : 0,
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
