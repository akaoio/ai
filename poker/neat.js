import { mkdir, writeFile } from "fs/promises"
import path from "path"

import PokerPlatform from "./Platform.js"
import { createNeatAgent } from "./agents.js"

export const entrantsFromPopulation = (population = [], config = {}) =>
    population.map((network, index) => ({
        createAgent: () => createNeatAgent(network, config.agent),
        id: config.idFor ? config.idFor(network, index) : `genome-${index}`,
        network
    }))

export const assignFitnessFromStandings = (population = [], standings = [], config = {}) => {
    const values = new Map(standings.map(item => [item.id, item]))
    return population.map((network, index) => {
        const id = config.idFor ? config.idFor(network, index) : `genome-${index}`
        const standing = values.get(id) || { appearances: 0, chipsWon: 0 }
        network.fitness = config.fitness ? config.fitness(standing, network, index) : standing.appearances ? standing.chipsWon / standing.appearances : 0
        network.score = standing.chipsWon
        return network
    })
}

export const serializeCheckpoint = (ecosystem, result, config = {}) => ({
    compatibility: ecosystem.compatibility,
    generation: config.generation ?? 0,
    population: ecosystem.population.map((network, index) => ({
        fitness: network.fitness ?? 0,
        id: config.idFor ? config.idFor(network, index) : `genome-${index}`,
        network: network.encode(),
        score: network.score ?? 0
    })),
    species: (ecosystem.species || []).map(species => ({
        bestFitness: species.bestFitness ?? 0,
        id: species.id,
        size: species.length,
        stagnant: species.stagnant ?? 0
    })),
    standings: result.standings
})

export const saveCheckpoint = async (ecosystem, result, config = {}) => {
    const directory = config.directory || path.resolve("poker/checkpoints")
    const generation = config.generation ?? 0
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, `generation-${String(generation).padStart(6, "0")}.json`)
    const payload = serializeCheckpoint(ecosystem, result, config)
    await writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8")
    return { file, payload }
}

export const runNeatGeneration = async (ecosystem, config = {}) => {
    const platform = config.platform instanceof PokerPlatform ? config.platform : new PokerPlatform(config.platform)
    const entrants = entrantsFromPopulation(ecosystem.population, config)
    const result = platform.runGeneration(entrants, config.generation)
    assignFitnessFromStandings(ecosystem.population, result.standings, config)
    if (config.autosave !== false) result.checkpoint = await saveCheckpoint(ecosystem, result, config.checkpoint || {})
    return result
}

export default { entrantsFromPopulation, assignFitnessFromStandings, serializeCheckpoint, saveCheckpoint, runNeatGeneration }
