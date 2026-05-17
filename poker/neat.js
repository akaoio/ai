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

export const runNeatGeneration = (ecosystem, config = {}) => {
    const platform = config.platform instanceof PokerPlatform ? config.platform : new PokerPlatform(config.platform)
    const entrants = entrantsFromPopulation(ecosystem.population, config)
    const result = platform.runGeneration(entrants, config.generation)
    assignFitnessFromStandings(ecosystem.population, result.standings, config)
    return result
}

export default { entrantsFromPopulation, assignFitnessFromStandings, runNeatGeneration }
