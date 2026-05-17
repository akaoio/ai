import { rankValue, suitValue } from "./cards.js"

const compareArrays = (left = [], right = []) => {
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const delta = (left[i] || 0) - (right[i] || 0)
        if (delta !== 0) return delta
    }
    return 0
}

const straightHigh = ranks => {
    const unique = [...new Set(ranks)].sort((a, b) => b - a)
    if (unique[0] === 14) unique.push(1)
    for (let i = 0; i <= unique.length - 5; i++) {
        const slice = unique.slice(i, i + 5)
        if (slice.every((rank, index) => index === 0 || slice[index - 1] - rank === 1)) return slice[0] === 1 ? 5 : slice[0]
    }
    return 0
}

export const evaluateFive = (cards = []) => {
    const ranks = cards.map(rankValue).sort((a, b) => b - a)
    const suits = cards.map(suitValue)
    const counts = new Map()
    ranks.forEach(rank => counts.set(rank, (counts.get(rank) || 0) + 1))
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
    const flush = suits.every(suit => suit === suits[0])
    const straight = straightHigh(ranks)

    if (flush && straight) return { category: 8, label: "straight-flush", ranks: [straight] }
    if (groups[0][1] === 4) return { category: 7, label: "four-kind", ranks: [groups[0][0], groups[1][0]] }
    if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, label: "full-house", ranks: [groups[0][0], groups[1][0]] }
    if (flush) return { category: 5, label: "flush", ranks }
    if (straight) return { category: 4, label: "straight", ranks: [straight] }
    if (groups[0][1] === 3) return { category: 3, label: "three-kind", ranks: [groups[0][0], ...groups.slice(1).map(([rank]) => rank)] }
    if (groups[0][1] === 2 && groups[1][1] === 2) {
        const pairs = groups.filter(([, count]) => count === 2).map(([rank]) => rank)
        const kicker = groups.find(([, count]) => count === 1)?.[0] || 0
        return { category: 2, label: "two-pair", ranks: [...pairs, kicker] }
    }
    if (groups[0][1] === 2) return { category: 1, label: "pair", ranks: [groups[0][0], ...groups.slice(1).map(([rank]) => rank)] }
    return { category: 0, label: "high-card", ranks }
}

export const compareRanks = (left, right) => {
    const category = left.category - right.category
    if (category !== 0) return category
    return compareArrays(left.ranks, right.ranks)
}

export const evaluateSeven = (cards = []) => {
    let best
    for (let a = 0; a < cards.length - 4; a++)
        for (let b = a + 1; b < cards.length - 3; b++)
            for (let c = b + 1; c < cards.length - 2; c++)
                for (let d = c + 1; d < cards.length - 1; d++)
                    for (let e = d + 1; e < cards.length; e++) {
                        const rank = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]])
                        if (!best || compareRanks(rank, best) > 0) best = rank
                    }
    return best
}

export default { evaluateFive, evaluateSeven, compareRanks }
