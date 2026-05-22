import { createDeck, shuffleDeck, drawCard, dealCards } from "./cards.js"
import { compareRanks, evaluateSeven } from "./evaluator.js"

const STAGES = ["preflop", "flop", "turn", "river"]

export class HumanAgent {
    constructor() {
        this._resolve = null
        this._observation = null
    }
    act(observation) {
        return new Promise(resolve => {
            this._resolve = resolve
            this._observation = observation
        })
    }
    submit(action) {
        if (this._resolve) {
            const resolve = this._resolve
            this._resolve = null
            resolve(action)
        }
    }
    get waiting() { return !!this._resolve }
    get observation() { return this._observation }
}

export class InteractiveGame {
    constructor(players, config = {}) {
        this.bigBlind = config.bigBlind || 10
        this.smallBlind = config.smallBlind || 5
        this.startingStack = config.startingStack || 500
        this.button = 0
        this.handNumber = 0
        this.community = []
        this.pot = 0
        this.log = []
        this.stage = "idle"
        this.handResult = null
        this.currentTurn = null  // id of player whose turn it is right now

        this.players = players.map((p, seat) => ({
            agent: p.agent,
            committed: 0,
            committedHand: 0,
            committedRound: 0,
            folded: false,
            hole: [],
            id: p.id,
            isHuman: p.agent instanceof HumanAgent,
            seat,
            stack: config.startingStack || 500,
            tableStartStack: config.startingStack || 500
        }))
    }

    get humanAgent() {
        return this.players.find(p => p.isHuman)?.agent
    }

    activeSeats() { return this.players.filter(p => p.stack > 0) }
    contenders() { return this.players.filter(p => !p.folded && (p.stack > 0 || p.committedHand > 0)) }

    nextSeat(from, filter = () => true) {
        for (let step = 1; step <= this.players.length; step++) {
            const seat = (from + step) % this.players.length
            if (filter(this.players[seat])) return seat
        }
        return from
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

    observation(player, state) {
        const legalActions = this.legalActions(player, state)
        const toCall = Math.max(0, state.currentBet - player.committedRound)
        const active = this.contenders()
        const effectiveStack = Math.max(0, ...active.filter(p => p.id !== player.id).map(p => Math.min(player.stack, p.stack)), player.stack)
        const relativePosition = (player.seat - this.button + this.players.length) % this.players.length
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
            maxRaiseTo: legalActions.find(a => a.type === "raise")?.max ?? player.committedRound + player.stack,
            minRaiseTo: legalActions.find(a => a.type === "raise")?.min ?? state.currentBet,
            playerCount: this.players.length,
            playerId: player.id,
            playersBehind: this.players.filter(p => !p.folded && p.stack > 0 && ((p.seat - player.seat + this.players.length) % this.players.length) > 0).length,
            playersToAct: Math.max(0, [...state.awaiting].filter(id => id !== player.id).length),
            position: player.seat,
            pot: this.pot,
            relativePosition,
            stage: state.stage,
            stageActions: state.actionCount,
            stageIndex: STAGES.indexOf(state.stage),
            stageRaises: state.raiseCount,
            stack: player.stack,
            startingStack: this.startingStack,
            toCall,
            totalRaises: this.log.filter(e => e.action === "raise").length
        }
    }

    normalizeAction(action, player, state) {
        const legal = this.legalActions(player, state)
        const legalSet = new Set(legal.map(a => a.type))
        const toCall = Math.max(0, state.currentBet - player.committedRound)
        if (!action || !legalSet.has(action.type)) return toCall === 0 ? { type: "check" } : { type: "call" }
        if (action.type === "raise") {
            const limits = legal.find(a => a.type === "raise")
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
        if (action.type === "fold") { player.folded = true; return { type: "fold" } }
        if (action.type === "check") return { type: "check" }
        if (action.type === "call") { this.wager(player, toCall); return { type: "call" } }
        if (action.type === "raise") {
            const prev = state.currentBet
            const target = Math.min(action.amount, player.committedRound + player.stack)
            this.wager(player, target - player.committedRound)
            state.currentBet = player.committedRound
            state.minRaise = Math.max(this.bigBlind, state.currentBet - prev)
            return { type: "raise", amount: player.committedRound }
        }
        return { type: "check" }
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

    async playBettingRound(stage, startSeat, roundState) {
        const state = roundState || {
            actionCount: 0,
            currentBet: Math.max(...this.players.map(p => p.committedRound)),
            lastAggressorSeat: -1,
            minRaise: this.bigBlind,
            raiseCount: 0,
            stage
        }

        this.stage = stage
        const order = Array.from({ length: this.players.length }, (_, i) => this.players[(startSeat + i) % this.players.length])
            .filter(p => !p.folded && (p.stack > 0 || p.committedHand > 0))
        let awaiting = new Set(order.filter(p => !p.allIn && !p.folded).map(p => p.id))
        state.awaiting = awaiting

        while (awaiting.size && this.contenders().length > 1) {
            let progressed = false
            for (const player of order) {
                if (!awaiting.has(player.id)) continue
                if (player.folded || player.allIn) { awaiting.delete(player.id); continue }

                this.currentTurn = player.id
                const obs = this.observation(player, state)
                const response = await player.agent?.act(obs)
                this.currentTurn = null

                const action = this.normalizeAction(response, player, state)
                const result = this.applyAction(player, action, state)

                const label = player.isHuman ? "You" : player.id
                const actionStr = result.type === "raise" ? `raise to ${result.amount}` : result.type
                this.log.push({ player: player.id, action: result.type, text: `${label} ${actionStr}` })

                state.actionCount++
                progressed = true

                if (result.type === "raise") {
                    state.raiseCount++
                    state.lastAggressorSeat = player.seat
                    awaiting = new Set(order.filter(c => !c.folded && !c.allIn && c.id !== player.id).map(c => c.id))
                } else awaiting.delete(player.id)
                state.awaiting = awaiting

                if (this.contenders().length <= 1) { awaiting.clear(); break }
            }
            if (!progressed) break
        }

        this.players.forEach(p => { p.committedRound = 0 })
    }

    sidePots() {
        const levels = [...new Set(this.players.map(p => p.committedHand).filter(Boolean))].sort((a, b) => a - b)
        let prev = 0
        return levels.map(level => {
            const contributors = this.players.filter(p => p.committedHand >= level)
            const eligible = contributors.filter(p => !p.folded)
            const amount = (level - prev) * contributors.length
            prev = level
            return { amount, eligible }
        })
    }

    settleShowdown() {
        const pots = this.sidePots()
        const ranks = new Map(this.contenders().map(p => [p.id, evaluateSeven([...p.hole, ...this.community])]))
        pots.forEach(sidePot => {
            if (!sidePot.amount || !sidePot.eligible.length) return
            const winners = sidePot.eligible.reduce((best, p) => {
                if (!best.length) return [p]
                const cmp = compareRanks(ranks.get(p.id), ranks.get(best[0].id))
                if (cmp > 0) return [p]
                if (cmp === 0) return [...best, p]
                return best
            }, [])
            const share = Math.floor(sidePot.amount / winners.length)
            let remainder = sidePot.amount - share * winners.length
            winners.forEach(p => { p.stack += share; if (remainder-- > 0) p.stack++ })
        })
        return ranks
    }

    async playHand() {
        if (this.activeSeats().length < 2) return

        this.handNumber++
        this.handResult = null
        this.log.push({ text: `── Hand #${this.handNumber} ──`, divider: true })

        // Reset
        this.community = []
        this.pot = 0
        this.players.forEach(p => {
            p.allIn = false
            p.committedHand = 0
            p.committedRound = 0
            p.folded = p.stack <= 0
            p.hole = []
        })

        const deck = shuffleDeck(createDeck())
        // Deal 2 cards each
        for (let round = 0; round < 2; round++) {
            for (let step = 1; step <= this.players.length; step++) {
                const seat = (this.button + step) % this.players.length
                if (this.players[seat].stack > 0) this.players[seat].hole.push(deck.shift())
            }
        }

        const sbSeat = this.nextSeat(this.button, p => p.stack > 0)
        const bbSeat = this.nextSeat(sbSeat, p => p.stack > 0)
        this.postBlind(sbSeat, this.smallBlind)
        this.postBlind(bbSeat, this.bigBlind)
        const sbName = this.players[sbSeat].isHuman ? "You" : this.players[sbSeat].id
        const bbName = this.players[bbSeat].isHuman ? "You" : this.players[bbSeat].id
        this.log.push({ text: `${sbName} posts SB ${this.smallBlind}` })
        this.log.push({ text: `${bbName} posts BB ${this.bigBlind}` })

        const preflopStart = this.nextSeat(bbSeat, p => !p.folded)
        await this.playBettingRound("preflop", preflopStart)

        if (this.contenders().length > 1) {
            this.community.push(...[deck.shift(), deck.shift(), deck.shift()])
            this.log.push({ text: `Flop: ${this.community.slice(0, 3).join(" ")}` })
            await this.playBettingRound("flop", this.nextSeat(this.button, p => !p.folded))
        }
        if (this.contenders().length > 1) {
            this.community.push(deck.shift())
            this.log.push({ text: `Turn: ${this.community[3]}` })
            await this.playBettingRound("turn", this.nextSeat(this.button, p => !p.folded))
        }
        if (this.contenders().length > 1) {
            this.community.push(deck.shift())
            this.log.push({ text: `River: ${this.community[4]}` })
            await this.playBettingRound("river", this.nextSeat(this.button, p => !p.folded))
        }

        this.stage = "showdown"

        if (this.contenders().length === 1) {
            const winner = this.contenders()[0]
            winner.stack += this.pot
            const wName = winner.isHuman ? "You" : winner.id
            this.log.push({ text: `${wName} wins ${this.pot} (all folded)` })
            this.handResult = { winners: [{ id: winner.id, amount: this.pot }], showdown: false }
        } else {
            const ranks = this.settleShowdown()
            const revealed = this.contenders().map(p => ({
                id: p.id,
                hole: p.hole,
                handLabel: ranks.get(p.id)?.label ?? "?"
            }))
            const contenders = this.contenders()
            const winner = contenders.reduce((best, p) => {
                if (!best) return p
                return compareRanks(ranks.get(p.id), ranks.get(best.id)) >= 0 ? p : best
            }, null)
            const wName = winner?.isHuman ? "You" : winner?.id
            this.log.push({ text: `Showdown! ${wName} wins ${this.pot} with ${ranks.get(winner?.id)?.label}` })
            this.handResult = { revealed, showdown: true, winners: [{ id: winner?.id, amount: this.pot }] }
        }

        // Rotate button
        this.button = this.nextSeat(this.button, p => p.stack > 0)
        this.stage = "idle"

        // Trim log to last 50 entries
        if (this.log.length > 50) this.log = this.log.slice(-50)
    }

    getState(humanId = "human") {
        const human = this.players.find(p => p.isHuman)
        const humanObs = this.humanAgent?.observation
        return {
            bigBlind: this.bigBlind,
            community: this.community,
            currentTurn: this.currentTurn,
            handNumber: this.handNumber,
            handResult: this.handResult,
            humanTurn: this.currentTurn === human?.id,
            legalActions: humanObs ? this.legalActions(human, { currentBet: humanObs.currentBet, minRaise: humanObs.minRaiseTo - humanObs.currentBet }) : [],
            log: this.log.slice(-20),
            players: this.players.map(p => ({
                allIn: p.allIn || false,
                committedHand: p.committedHand,
                dealer: p.seat === this.button,
                folded: p.folded,
                hole: p.isHuman ? p.hole : (this.stage === "showdown" && this.handResult?.showdown ? p.hole : ["??", "??"]),
                id: p.id,
                isHuman: p.isHuman,
                seat: p.seat,
                stack: p.stack,
                active: this.currentTurn === p.id
            })),
            pot: this.pot,
            smallBlind: this.smallBlind,
            stage: this.stage,
            gameOver: !!this._gameOver
        }
    }
}

export default InteractiveGame
