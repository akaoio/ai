import http from "http"
import fs from "fs"
import path from "path"
import url from "url"

const port = 3000

// ─── Interactive Poker Game Session ──────────────────────────────────────────
let gameSession = null
let gameLoopPromise = null

async function startNewGame() {
    const { InteractiveGame, HumanAgent } = await import("./poker/InteractiveGame.js")
    const { HeuristicAgent, createNeatAgent } = await import("./poker/agents.js")
    const { loadLatestCheckpoint } = await import("./poker/neat.js")
    const Ecosystem = (await import("./Ecosystem.js")).default

    // Load best genome from latest checkpoint
    const ecosystem = new Ecosystem({ bitnet: true, size: 100 })
    const resumed = await loadLatestCheckpoint("poker/checkpoints/bitnet", ecosystem)
    const bestNetwork = ecosystem.best() || ecosystem.population[0]

    const humanAgent = new HumanAgent()
    const players = [
        { id: "human", agent: humanAgent },
        { id: resumed ? `AI-gen${resumed.generation}` : "AI-best", agent: createNeatAgent(bestNetwork) },
        { id: "heuristic-tight", agent: new HeuristicAgent({ id: "heuristic-tight", style: "tight" }) },
        { id: "heuristic-balanced", agent: new HeuristicAgent({ id: "heuristic-balanced", style: "balanced" }) },
        { id: "heuristic-aggressive", agent: new HeuristicAgent({ id: "heuristic-aggressive", style: "aggressive" }) },
    ]

    gameSession = new InteractiveGame(players, { bigBlind: 10, smallBlind: 5, startingStack: 500 })
    gameSession._humanAgent = humanAgent
    gameSession._info = resumed ? `Loaded gen ${resumed.generation} best genome` : "No checkpoint — using fresh network"

    // Run game loop in background (plays hands continuously)
    gameLoopPromise = (async () => {
        while (true) {
            await gameSession.playHand()
            if (gameSession.activeSeats().length < 2) break
        }
    })()

    return gameSession
}

http.createServer(function (request, response) {
    console.log("REQUEST", request.url)
    const parsed = url.parse(request.url)

    // API: list checkpoint summaries for a given directory
    if (parsed.pathname === "/api/checkpoints") {
        const params = new URLSearchParams(parsed.query || "")
        const dir = "." + (params.get("dir") || "/poker/checkpoints/bitnet")
        try {
            const files = fs.readdirSync(dir)
                .filter(f => f.startsWith("generation-") && f.endsWith(".json"))
                .sort()
            const summaries = files.map(file => {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
                    const fitnesses = (data.population || []).map(p => p.fitness ?? 0)
                    const bestFitness = fitnesses.length ? Math.max(...fitnesses) : 0
                    const avgFitness = fitnesses.length ? fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length : 0
                    const neurons = (data.population || []).map(p => (p.network?.n || []).length)
                    const maxNeurons = neurons.length ? Math.max(...neurons) : 0
                    const avgNeurons = neurons.length ? Math.round(neurons.reduce((a, b) => a + b, 0) / neurons.length) : 0
                    return {
                        avgFitness: parseFloat(avgFitness.toFixed(2)),
                        avgNeurons,
                        bestFitness: parseFloat(bestFitness.toFixed(2)),
                        file,
                        generation: data.generation,
                        maxNeurons,
                        species: (data.species || []).length
                    }
                } catch {
                    return null
                }
            }).filter(Boolean)
            response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
            response.end(JSON.stringify(summaries))
        } catch (e) {
            response.writeHead(500, { "Content-Type": "application/json" })
            response.end(JSON.stringify({ error: e.message }))
        }
        return
    }

    // API: interactive play routes
    if (parsed.pathname === "/api/play/new") {
        let body = ""
        request.on("data", d => { body += d })
        request.on("end", async () => {
            try {
                gameSession = null
                await startNewGame()
                response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
                response.end(JSON.stringify({ ok: true, info: gameSession._info }))
            } catch (e) {
                response.writeHead(500, { "Content-Type": "application/json" })
                response.end(JSON.stringify({ error: e.message }))
            }
        })
        return
    }
    if (parsed.pathname === "/api/play/state") {
        response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        if (!gameSession) {
            response.end(JSON.stringify({ started: false }))
        } else {
            response.end(JSON.stringify(gameSession.getState()))
        }
        return
    }
    if (parsed.pathname === "/api/play/action") {
        let body = ""
        request.on("data", d => { body += d })
        request.on("end", async () => {
            try {
                if (!gameSession) throw new Error("No game session. POST /api/play/new first.")
                const { action } = JSON.parse(body)
                gameSession._humanAgent.submit(action)
                // Give the game loop a tick to advance
                await new Promise(r => setTimeout(r, 50))
                response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
                response.end(JSON.stringify(gameSession.getState()))
            } catch (e) {
                response.writeHead(400, { "Content-Type": "application/json" })
                response.end(JSON.stringify({ error: e.message }))
            }
        })
        return
    }

    // API: return the best network from the latest checkpoint
    if (parsed.pathname === "/api/best-network") {
        const params = new URLSearchParams(parsed.query || "")
        const dir = "." + (params.get("dir") || "/poker/checkpoints/bitnet")
        try {
            const files = fs.readdirSync(dir)
                .filter(f => f.startsWith("generation-") && f.endsWith(".json"))
                .sort()
            if (!files.length) { response.writeHead(404); response.end("{}"); return }
            const data = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"))
            const best = (data.population || []).reduce((a, b) => (b.fitness ?? 0) > (a.fitness ?? 0) ? b : a, data.population[0])
            response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
            response.end(JSON.stringify({ generation: data.generation, network: best?.network, fitness: best?.fitness }))
        } catch (e) {
            response.writeHead(500)
            response.end(JSON.stringify({ error: e.message }))
        }
        return
    }

    const file = "." + parsed.pathname
    const ext = String(path.extname(file)).toLowerCase()
    const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".wav": "audio/wav",
        ".mp4": "video/mp4",
        ".woff": "application/font-woff",
        ".ttf": "application/font-ttf",
        ".eot": "application/vnd.ms-fontobject",
        ".otf": "application/font-otf",
        ".wasm": "application/wasm"
    }
    const type = types[ext] || "application/octet-stream"
    fs.readFile(file, (error, content) => {
        if (!error) {
            response.writeHead(200, { "Content-Type": type })
            response.end(content, "utf-8")
        }
    })
}).listen(port)

console.log(`Server running at http://127.0.0.1:${port}/`)
console.log(`Poker dashboard: http://127.0.0.1:${port}/poker/visualize.html`)
