import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises"
import path from "path"

import PokerPlatform from "./Platform.js"
import { createNeatAgent } from "./agents.js"
import { random } from "../Utils.js"

export const entrantsFromPopulation = (population = [], config = {}) =>
    population.map((network, index) => ({
        createAgent: () => createNeatAgent(network, config.agent),
        id: config.idFor ? config.idFor(network, index) : `genome-${index}`,
        network
    }))

export const assignFitnessFromStandings = (population = [], standings = [], config = {}) => {
    const values = new Map(standings.map(item => [item.id, item]))
    // alpha=1.0 → raw fitness each generation (no smoothing, default/backward-compat)
    // alpha<1.0 → EMA: blend new measurement with previous to reduce poker's high evaluation noise.
    //   Only genomes that survived a previous generation (elites/parents) carry _previousFitness;
    //   fresh children (no _previousFitness) always receive their raw score.
    const alpha = config.fitnessSmoothing ?? 1.0
    return population.map((network, index) => {
        const id = config.idFor ? config.idFor(network, index) : `genome-${index}`
        const standing = values.get(id) || { appearances: 0, chipsWon: 0, hands: 0 }
        let rawFitness
        if (config.fitness) {
            rawFitness = config.fitness(standing, network, index)
        } else if (standing.hands && config.bigBlind) {
            // BB/100 hands: industry-standard poker performance metric
            rawFitness = (standing.chipsWon / standing.hands) / config.bigBlind * 100
        } else {
            rawFitness = standing.appearances ? standing.chipsWon / standing.appearances : 0
        }
        const prevFitness = network._previousFitness
        network.fitness = (alpha < 1.0 && prevFitness != null)
            ? alpha * rawFitness + (1 - alpha) * prevFitness
            : rawFitness
        network._previousFitness = network.fitness
        network.score = standing.chipsWon
        return network
    })
}

export const serializeCheckpoint = (ecosystem, result, config = {}) => ({
    compatibility: ecosystem.compatibility,
    connectionHistory: [...ecosystem.connectionHistory.entries()],
    generation: config.generation ?? 0,
    nextConnectionInnovation: ecosystem.nextConnectionInnovation,
    nextNodeInnovation: ecosystem.nextNodeInnovation,
    nextSpeciesId: ecosystem.nextSpeciesId,
    population: ecosystem.population.map((network, index) => ({
        fitness: network.fitness ?? 0,
        id: config.idFor ? config.idFor(network, index) : `genome-${index}`,
        network: network.encode(),
        previousFitness: network._previousFitness ?? null,
        score: network.score ?? 0
    })),
    species: (ecosystem.species || []).map(species => ({
        bestFitness: species.bestFitness ?? 0,
        id: species.id,
        size: species.length,
        stagnant: species.stagnant ?? 0
    })),
    splitHistory: [...ecosystem.splitHistory.entries()],
    standings: result.standings
})

export const saveCheckpoint = async (ecosystem, result, config = {}) => {
    const directory = config.directory || path.resolve("poker/checkpoints")
    const generation = config.generation ?? 0
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, `generation-${String(generation).padStart(6, "0")}.json`)
    const payload = serializeCheckpoint(ecosystem, result, config)
    await writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8")

    // Keep only the last 50 checkpoints
    const keep = config.keep ?? 50
    const allFiles = (await readdir(directory))
        .filter(f => f.startsWith("generation-") && f.endsWith(".json"))
        .sort()
    const toDelete = allFiles.slice(0, Math.max(0, allFiles.length - keep))
    await Promise.all(toDelete.map(f => unlink(path.join(directory, f))))

    return { file, payload }
}

export const loadLatestCheckpoint = async (directory, ecosystem) => {
    try {
        const files = (await readdir(directory))
            .filter(f => f.startsWith("generation-") && f.endsWith(".json"))
            .sort()
        if (!files.length) return null

        const file = path.join(directory, files[files.length - 1])
        const data = JSON.parse(await readFile(file, "utf8"))

        // Restore innovation tracking state
        if (data.connectionHistory) ecosystem.connectionHistory = new Map(data.connectionHistory)
        if (data.splitHistory) ecosystem.splitHistory = new Map(data.splitHistory)
        if (data.nextConnectionInnovation != null) ecosystem.nextConnectionInnovation = data.nextConnectionInnovation
        if (data.nextNodeInnovation != null) ecosystem.nextNodeInnovation = data.nextNodeInnovation
        if (data.nextSpeciesId != null) ecosystem.nextSpeciesId = data.nextSpeciesId
        if (data.compatibility != null) ecosystem.compatibility = data.compatibility

        // Restore population
        const Network = (await import("../Network.js")).default
        ecosystem.population = data.population.map(item => {
            const net = new Network(item.network)
            net.fitness = item.fitness ?? 0
            net._previousFitness = item.previousFitness ?? undefined
            net.score = item.score ?? 0
            return ecosystem.ensureCanonical(net)
        })

        return { file, generation: data.generation }
    } catch {
        return null
    }
}

export const runNeatGeneration = async (ecosystem, config = {}) => {
    const platform = config.platform instanceof PokerPlatform ? config.platform : new PokerPlatform(config.platform)

    const neatEntrants = entrantsFromPopulation(ecosystem.population, config)

    // Mix in baseline agents (heuristic/random opponents) for richer training signal
    const baselineEntrants = (config.baseline || []).map((entry, index) => ({
        createAgent: typeof entry.createAgent === "function" ? entry.createAgent : () => entry,
        id: entry.id || `baseline-${index}`,
        isBaseline: true
    }))
    const baselineIds = new Set(baselineEntrants.map(e => e.id))

    const allEntrants = [...neatEntrants, ...baselineEntrants]
    const result = await platform.runGeneration(allEntrants, {
        ...config.generation,
        // Guarantee at least 1 baseline per table so genomes are always benchmarked
        // against fixed-skill opponents — not just each other ("king of fools" problem)
        guaranteed: baselineEntrants.length ? [random(baselineEntrants)] : []
    })

    // Only assign fitness to NEAT genomes, not baseline agents
    const neatStandings = result.standings.filter(s => !baselineIds.has(s.id))
    assignFitnessFromStandings(ecosystem.population, neatStandings, {
        ...config,
        bigBlind: config.bigBlind ?? platform.bigBlind
    })

    if (config.autosave !== false) result.checkpoint = await saveCheckpoint(ecosystem, result, config.checkpoint || {})
    return result
}

export default { entrantsFromPopulation, assignFitnessFromStandings, serializeCheckpoint, saveCheckpoint, loadLatestCheckpoint, runNeatGeneration }
