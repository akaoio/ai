import { randomFloat } from "../Utils.js"

export const SUITS = ["c", "d", "h", "s"]
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]

export const rankValue = card => RANKS.indexOf(card[0]) + 2
export const suitValue = card => card[1]

export const createDeck = () => RANKS.flatMap(rank => SUITS.map(suit => `${rank}${suit}`))

export const shuffleDeck = (deck = createDeck()) => {
    const cards = [...deck]
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(randomFloat(0, i + 1))
        ;[cards[i], cards[j]] = [cards[j], cards[i]]
    }
    return cards
}

export const drawCard = deck => deck.shift()

export const dealCards = (deck, count = 1) => Array.from({ length: count }, () => drawCard(deck))

export default { SUITS, RANKS, createDeck, shuffleDeck, drawCard, dealCards, rankValue, suitValue }
