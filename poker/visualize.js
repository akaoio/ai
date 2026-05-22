import { Visualization } from "../Visualization.js"
import Network from "../Network.js"

const CHECKPOINT_DIR = "/poker/checkpoints/bitnet"
let autoInterval = null
let summaries = []

const $ = id => document.getElementById(id)

// ─── Charts ──────────────────────────────────────────────────────────────────

function drawLineChart(canvasId, series, opts = {}) {
    const canvas = $(canvasId)
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight || 220
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext("2d")
    ctx.scale(dpr, dpr)

    const pad = { top: 16, right: 16, bottom: 28, left: 52 }
    const pw = w - pad.left - pad.right
    const ph = h - pad.top - pad.bottom

    // Compute range across all series
    const allValues = series.flatMap(s => s.data)
    const minV = opts.min ?? Math.min(...allValues)
    const maxV = opts.max ?? Math.max(...allValues)
    const range = maxV - minV || 1
    const n = Math.max(...series.map(s => s.data.length))

    // Background
    ctx.fillStyle = "#111"
    ctx.fillRect(0, 0, w, h)

    // Grid lines
    ctx.strokeStyle = "#1e1e1e"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (ph / 4) * i
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke()
        const val = maxV - (range / 4) * i
        ctx.fillStyle = "#555"
        ctx.font = "10px Courier New"
        ctx.textAlign = "right"
        ctx.fillText(val.toFixed(0), pad.left - 6, y + 4)
    }

    // Zero line
    if (minV < 0 && maxV > 0) {
        const zy = pad.top + ph * (maxV / range)
        ctx.strokeStyle = "#333"
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(pad.left, zy); ctx.lineTo(pad.left + pw, zy); ctx.stroke()
        ctx.setLineDash([])
    }

    // X axis labels
    ctx.fillStyle = "#555"
    ctx.font = "10px Courier New"
    ctx.textAlign = "center"
    const step = Math.max(1, Math.floor(n / 8))
    for (let i = 0; i < n; i += step) {
        const x = pad.left + (i / (n - 1 || 1)) * pw
        ctx.fillText(i + 1, x, h - 6)
    }

    // Series lines
    series.forEach(({ data, color }) => {
        if (!data.length) return
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath()
        data.forEach((v, i) => {
            const x = pad.left + (i / (n - 1 || 1)) * pw
            const y = pad.top + ph - ph * ((v - minV) / range)
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke()
    })
}

// ─── Stats update ─────────────────────────────────────────────────────────────

function updateStats(data) {
    if (!data.length) return
    const last = data[data.length - 1]

    $("s-gen").textContent = last.generation
    $("s-best").textContent = last.bestFitness.toFixed(2)
    $("s-best").className = "value" + (last.bestFitness < 0 ? " negative" : "")
    $("s-avg").textContent = last.avgFitness.toFixed(2)
    $("s-avg").className = "value" + (last.avgFitness < 0 ? " negative" : "")
    $("s-species").textContent = last.species
    $("s-neurons").textContent = last.maxNeurons
    $("s-avg-neurons").textContent = last.avgNeurons
    $("gen-range").textContent = `gen 1–${last.generation} (${data.length} checkpoints)`
}

function updateCharts(data) {
    if (!data.length) return
    const gens = data.map(d => d.generation)
    drawLineChart("chart-fitness", [
        { data: data.map(d => d.bestFitness), color: "#7dd87d" },
        { data: data.map(d => d.avgFitness), color: "#2772db" }
    ])
    drawLineChart("chart-neurons", [
        { data: data.map(d => d.maxNeurons), color: "#f0a500", min: 0 },
        { data: data.map(d => d.avgNeurons), color: "#888", min: 0 }
    ], { min: 0 })
}

// ─── Network topology ─────────────────────────────────────────────────────────

const viz = new Visualization({
    svg: $("network"),
    colors: {
        neuron: { fill: "#1a1a1a", stroke: "#7dd87d" },
        connection: { forward: "#2772db", recursive: "#7dd87d" },
        text: { bias: "#555", weight: "#e05555" }
    }
})

async function updateNetwork() {
    try {
        const res = await fetch(`/api/best-network?dir=${encodeURIComponent(CHECKPOINT_DIR)}`)
        if (!res.ok) return
        const { network, generation, fitness } = await res.json()
        if (!network) return
        // Decode encoded JSON into a live Network object
        const liveNet = new Network(network)
        // Visualization.present() accesses data.n[innovationID] (sparse by #),
        // but liveNet.n is a dense 0-based array — remap to sparse array indexed by #
        const nByHash = []
        liveNet.n.forEach(n => { nByHash[n["#"]] = n })
        viz.present({ ...liveNet, n: nByHash })
        $("network-info").textContent = `Gen ${generation} | fitness: ${fitness?.toFixed(2)} BB/100 | neurons: ${liveNet.n.length} | connections: ${liveNet.c.length}`
    } catch (e) {
        $("network-info").textContent = `Error: ${e.message}`
    }
}

// ─── Main load ────────────────────────────────────────────────────────────────

window.load = async function () {
    $("status").textContent = "Loading…"
    try {
        const res = await fetch(`/api/checkpoints?dir=${encodeURIComponent(CHECKPOINT_DIR)}`)
        summaries = await res.json()
        updateStats(summaries)
        updateCharts(summaries)
        await updateNetwork()
        $("status").textContent = `Updated ${new Date().toLocaleTimeString()}`
    } catch (e) {
        $("status").textContent = `Error: ${e.message}`
    }
}

window.toggleAuto = function () {
    const btn = $("btn-auto")
    if (autoInterval) {
        clearInterval(autoInterval)
        autoInterval = null
        btn.textContent = "Auto-refresh: OFF"
        btn.classList.remove("active")
    } else {
        autoInterval = setInterval(load, 15000)
        btn.textContent = "Auto-refresh: ON (15s)"
        btn.classList.add("active")
        load()
    }
}

// Initial load
load()

// Redraw charts on window resize
window.addEventListener("resize", () => updateCharts(summaries))
