let generator = Math.random

const normalizeSeed = seed => {
    if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0
    const text = String(seed ?? Date.now())
    let value = 2166136261
    for (let i = 0; i < text.length; i++) {
        value ^= text.charCodeAt(i)
        value = Math.imul(value, 16777619)
    }
    return value >>> 0
}

export const createRng = seed => {
    let state = normalizeSeed(seed)
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 4294967296
    }
}

export const setSeed = seed => {
    generator = createRng(seed)
    return generator
}

export const setRandomGenerator = next => {
    generator = typeof next === "function" ? next : Math.random
    return generator
}

export const getRandomGenerator = () => generator

export const randomFloat = (min = 0, max = 1, rng = generator) => {
    const floor = Math.min(min, max)
    const ceil = Math.max(min, max)
    if (floor === ceil) return floor
    return floor + (ceil - floor) * rng()
}

export const chance = (rate = 0.5, rng = generator) => {
    if (rate <= 0) return false
    if (rate >= 1) return true
    return rng() < rate
}

export const uid = () => {
    return Date.now().toString(36) + Math.floor(randomFloat(0, 999999999)).toString(36)
}

export const random = (...input) => {
    if (Array.isArray(input[0])) return input[0][Math.floor(randomFloat(0, input[0].length))]
    if (input.length === 2 && input.every(i => typeof i === "number")) {
        const min = Math.min(...input)
        const max = Math.max(...input)
        if (min === max) return min
        return Math.round(randomFloat(min, max))
    }
}

export const rearrange = (...inputs) => {
    const sum = inputs.reduce((value, item) => value + item, 0)
    const target = sum / inputs.length
    return inputs.map(value => value + (target - value) * 0.75)
}

export const merge = (destination = {}, source = {}) => {
    for (const key in source) {
        if (typeof destination[key] === "object") destination[key] = merge(destination[key], source[key])
        else destination[key] = source[key]
    }
    return destination
}

export default { uid, random, rearrange, merge, createRng, setSeed, setRandomGenerator, getRandomGenerator, randomFloat, chance }
