import http from "http"
import fs from "fs"
import path from "path"
import url from "url"

const port = 3000

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
