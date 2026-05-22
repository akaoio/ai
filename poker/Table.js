import { createDeck, dealCards, drawCard, shuffleDeck } from "./cards.js"
import { compareRanks, evaluateSeven } from "./evaluator.js"

const STAGES = ["preflop", "flop", "turn", "river"]

class PokerTable {
    constructor(config = {}) {
        this.smallBlind = config.smallBlind || 5
        this.bigBlind = config.bigBlind || 10
        this.startingStack = config.startingStack || 1000
        this.maxHands = config.maxHands || 1
        this.players = (config.players || []).map((player, seat) => ({
            agent: player.agent,
            allInRaises: 0,
            busts: 0,
            chipsWon: 0,
            committedHand: 0,
            committedRound: 0,
            folded: false,
            handsActive: 0,
            hole: [],
            id: player.id || `player-${seat}`,
            seat,
            stack: player.stack ?? this.startingStack,
            startStack: player.stack ?? this.startingStack,
            tableStartStack: player.stack ?? this.startingStack
        }))
        this.button = config.button || 0
        this.handNumber = 0
        this.community = []
        this.pot = 0
        this.history = []
    }

    activeSeats() {
        return this.players.filter(player => player.stack > 0)
    }

    contenders() {
        return this.players.filter(player => !player.folded && (player.stack > 0 || player.committedHand > 0))
    }

    nextSeat(from, filter = () => true) {
        for (let step = 1; step <= this.players.length; step++) {
            const seat = (from + step) % this.players.length
            if (filter(this.players[seat])) return seat
        }
        return from
    }

    resetHandState() {
        this.community = []
        this.pot = 0
        this.players.forEach(player => {
            player.allIn = false
            player.committedHand = 0
            player.committedRound = 0
            player.folded = player.stack <= 0
            player.hole = []
            player.startStack = player.stack
        })
    }

    deck(source) {
        if (source?.length) return [...source]
        return shuffleDeck(createDeck())
    }

    dealPrivateCards(deck) {
        for (let round = 0; round < 2; round++) {
            for (let step = 1; step <= this.players.length; step++) {
                const seat = (this.button + step) % this.players.length
                if (this.players[seat].stack > 0) this.players[seat].hole.push(drawCard(deck))
            }
        }
    }

    postBlind(seat, amount) {
        const player = this.players[seat]
        const blind = Math.min(amount, player.stack)
        player.stack -= blind
        player.committedRound += blind
        player.committedHand += blind
        player.allIn = player.stack === 0
        this.pot += blind
        return blind
    }

    legalActions(player, state) {
        const toCall = Math.max(0, state.currentBet - player.committedRound)
        const actions = []
        if (toCall > 0) actions.push({ type: "fold" })
        if (toCall === 0) actions.push({ type: "check" })
        if (toCall > 0 && player.stack > 0) actions.push({ amount: Math.min(toCall, player.stack), type: "call" })
        const minRaiseTo = Math.max(state.currentBet + state.minRaise, player.committedRound + toCall + this.bigBlind)
        const maxRaiseTo = player.committedRound + player.stack
        if (player.stack > toCall && maxRaiseTo >= minRaiseTo) actions.push({ max: maxRaiseTo, min: minRaiseTo, type: "raise" })
        return actions
    }

    observation(player, seat, state) {
        const legalActions = this.legalActions(player, state)
        const toCall = Math.max(0, state.currentBet - player.committedRound)
        const active = this.contenders()
        const effectiveStack = Math.max(0, ...active.filter(item => item.id !== player.id).map(item => Math.min(player.stack, item.stack)), player.stack)
        const relativePosition = (seat - this.button + this.players.length) % this.players.length
        const playersBehind = this.players.filter(item => !item.folded && item.stack > 0 && ((item.seat - seat + this.players.length) % this.players.length) > 0).length
        return {
            activePlayers: active.length,
            bigBlind: this.bigBlind,
            button: this.button,
            community: [...this.community],
            currentBet: state.currentBet,
            effectiveStack,
            handNumber: this.handNumber,
            hole: [...player.hole],
            legalActions,
            committedHand: player.committedHand,
            lastAggressorPosition: state.lastAggressorSeat ?? -1,
            maxRaiseTo: legalActions.find(action => action.type === "raise")?.max || player.committedRound + player.stack,
            minRaiseTo: legalActions.find(action => action.type === "raise")?.min || state.currentBet,
            playerCount: this.players.length,
            playerId: player.id,
            position: seat,
            pot: this.pot,
            playersBehind,
            playersToAct: Math.max(0, [...state.awaiting].filter(id => id !== player.id).length),
            relativePosition,
            stage: state.stage,
            stageActions: state.actionCount,
            stageIndex: STAGES.indexOf(state.stage),
            stageRaises: state.raiseCount,
            stack: player.stack,
            startingStack: this.startingStack,
            toCall,
            totalRaises: this.history.filter(item => item.action === "raise").length
        }
    }

    normalizeAction(action, player, state) {
        const legal = this.legalActions(player, state)
        const legalSet = new Set(legal.map(item => item.type))
        const toCall = Math.max(0, state.currentBet - player.committedRound)
        if (!action || !legalSet.has(action.type)) return toCall === 0 ? { type: "check" } : { type: "call" }
        if (action.type === "raise") {
            const limits = legal.find(item => item.type === "raise")
            const amount = Math.min(limits.max, Math.max(limits.min, action.amount ?? limits.min))
            return { amount, type: "raise" }
        }
        return action
    }

    wager(player, amount) {
        const chips = Math.min(amount, player.stack)
        player.stack -= chips
        player.committedRound += chips
        player.committedHand += chips
        player.allIn = player.stack === 0
        this.pot += chips
        return chips
    }

    applyAction(player, action, state) {
        const toCall = Math.max(0, state.currentBet - player.committedRound)
        if (action.type === "fold") {
            player.folded = true
            return { type: "fold" }
        }
        if (action.type === "check") return { type: "check" }
        if (action.type === "call") {
            // Calling off ≥50% of remaining stack: heavy penalty (5 events worth)
            if (player.stack > 0 && toCall >= player.stack * 0.5) player.allInRaises += 5
            this.wager(player, toCall)
            return { type: "call" }
        }
        if (action.type === "raise") {
            const previous = state.currentBet
            const target = Math.min(action.amount, player.committedRound + player.stack)
            const amountAdded = target - player.committedRound
            const stackBefore = player.stack
            this.wager(player, amountAdded)
            state.currentBet = player.committedRound
            state.minRaise = Math.max(this.bigBlind, state.currentBet - previous)
            // Raising all-in or committing >50% of stack: heavy penalty (5 events worth)
            if (player.allIn || amountAdded > stackBefore * 0.5) player.allInRaises += 5
            return { type: "raise" }
        }
        return { type: "check" }
    }

    bettingOrder(startSeat) {
        return Array.from({ length: this.players.length }, (_, index) => this.players[(startSeat + index) % this.players.length]).filter(player => !player.folded && (player.stack > 0 || player.committedHand > 0))
    }

    playBettingRound(stage, startSeat) {
        const state = {
            actionCount: 0,
            currentBet: Math.max(...this.players.map(player => player.committedRound)),
            lastAggressorSeat: -1,
            minRaise: this.bigBlind,
            raiseCount: 0,
            stage
        }
        const order = this.bettingOrder(startSeat)
        let awaiting = new Set(order.filter(player => !player.allIn && !player.folded).map(player => player.id))
        state.awaiting = awaiting

        while (awaiting.size && this.contenders().length > 1) {
            let progressed = false
            for (const player of order) {
                if (!awaiting.has(player.id)) continue
                if (player.folded || player.allIn) {
                    awaiting.delete(player.id)
                    continue
                }
                const observation = this.observation(player, player.seat, state)
                const response = player.agent?.act?.(observation)
                const action = this.normalizeAction(response, player, state)
                const result = this.applyAction(player, action, state)
                state.actionCount++
                this.history.push({ action: result.type, player: player.id, stage })
                progressed = true
                if (result.type === "raise") {
                    state.raiseCount++
                    state.lastAggressorSeat = player.seat
                    awaiting = new Set(order.filter(candidate => !candidate.folded && !candidate.allIn && candidate.id !== player.id).map(candidate => candidate.id))
                } else awaiting.delete(player.id)
                state.awaiting = awaiting
                if (this.contenders().length <= 1) {
                    awaiting.clear()
                    break
                }
            }
            if (!progressed) break
        }

        this.players.forEach(player => {
            player.committedRound = 0
        })
    }

    revealCommunity(deck, count) {
        this.community.push(...dealCards(deck, count))
    }

    sidePots() {
        const levels = [...new Set(this.players.map(player => player.committedHand).filter(Boolean))].sort((a, b) => a - b)
        let previous = 0
        return levels.map(level => {
            const contributors = this.players.filter(player => player.committedHand >= level)
            const eligible = contributors.filter(player => !player.folded)
            const amount = (level - previous) * contributors.length
            previous = level
            return { amount, eligible }
        })
    }

    settleShowdown() {
        const pots = this.sidePots()
        const ranks = new Map(this.contenders().map(player => [player.id, evaluateSeven([...player.hole, ...this.community])]))
        pots.forEach(sidePot => {
            if (!sidePot.amount || !sidePot.eligible.length) return
            const winners = sidePot.eligible.reduce((best, player) => {
                if (!best.length) return [player]
                const compare = compareRanks(ranks.get(player.id), ranks.get(best[0].id))
                if (compare > 0) return [player]
                if (compare === 0) return [...best, player]
                return best
            }, [])
            const share = Math.floor(sidePot.amount / winners.length)
            let remainder = sidePot.amount - share * winners.length
            winners.forEach(player => {
                player.stack += share
                if (remainder > 0) {
                    player.stack++
                    remainder--
                }
            })
        })
        return ranks
    }

    rotateButton() {
        this.button = this.nextSeat(this.button, player => player.stack > 0)
    }

    standings() {
        return this.players.map(player => ({
            allInRaises: player.allInRaises,
            busts: player.busts,
            chipsWon: player.stack - player.tableStartStack,
            handsActive: player.handsActive,
            id: player.id,
            stack: player.stack
        }))
    }

    playHand(config = {}) {
        if (this.activeSeats().length < 2) return { complete: true, standings: this.standings() }

        this.handNumber++
        this.resetHandState()
        const deck = this.deck(config.deck)
        this.dealPrivateCards(deck)

        const smallBlindSeat = this.nextSeat(this.button, player => player.stack > 0)
        const bigBlindSeat = this.nextSeat(smallBlindSeat, player => player.stack > 0)
        this.postBlind(smallBlindSeat, this.smallBlind)
        this.postBlind(bigBlindSeat, this.bigBlind)

        const preflopStart = this.nextSeat(bigBlindSeat, player => !player.folded)
        this.playBettingRound("preflop", preflopStart)
        if (this.contenders().length > 1) {
            this.revealCommunity(deck, 3)
            this.playBettingRound("flop", this.nextSeat(this.button, player => !player.folded))
        }
        if (this.contenders().length > 1) {
            this.revealCommunity(deck, 1)
            this.playBettingRound("turn", this.nextSeat(this.button, player => !player.folded))
        }
        if (this.contenders().length > 1) {
            this.revealCommunity(deck, 1)
            this.playBettingRound("river", this.nextSeat(this.button, player => !player.folded))
        }

        if (this.contenders().length === 1) this.contenders()[0].stack += this.pot
        else this.settleShowdown()

        // Bankroll tracking: count active hands and busts
        this.players.forEach(player => {
            if (player.startStack > 0) {
                player.handsActive++
                if (player.stack === 0) player.busts++
            }
        })

        const result = {
            community: [...this.community],
            complete: false,
            handNumber: this.handNumber,
            standings: this.standings()
        }
        this.rotateButton()
        return result
    }

    playHands(count = this.maxHands, config = {}) {
        const results = []
        for (let hand = 0; hand < count; hand++) {
            const deck = typeof config.deckFactory === "function" ? config.deckFactory(hand) : undefined
            results.push(this.playHand({ deck }))
            if (this.activeSeats().length < 2) break
        }
        return results
    }
}

export default PokerTable
