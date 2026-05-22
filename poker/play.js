// poker/play.js — frontend for interactive game vs AI
const API = ""  // same origin

// ── Helpers ──────────────────────────────────────────────────────────────────
const suitSymbol = { c: "♣", d: "♦", h: "♥", s: "♠" }
const rankName = { T: "10", J: "J", Q: "Q", K: "K", A: "A" }

function cardHTML(code, faceDown = false, extraClass = "") {
    if (faceDown || code === "??" || code === "?") {
        return `<div class="card back ${extraClass}">🂠</div>`
    }
    const rank = code.length === 2 ? (rankName[code[0]] || code[0]) : code.slice(0, -1)
    const suit = code.slice(-1)
    const sym = suitSymbol[suit] || suit
    const red = suit === "h" || suit === "d" ? " red" : ""
    return `<div class="card${red} ${extraClass}">${rank}<br>${sym}</div>`
}

function seatEl(seat) { return document.getElementById(`s${seat}`) }

function ensureSeats(players) {
    const wrap = document.getElementById("table-wrap")
    players.forEach((p, idx) => {
        let el = document.getElementById(`s${p.seat}`)
        if (!el) {
            el = document.createElement("div")
            el.className = "seat"
            el.id = `s${p.seat}`
            wrap.appendChild(el)
        }
    })
}

// ── Render ────────────────────────────────────────────────────────────────────
function render(state) {
    if (!state || !state.players) return

    ensureSeats(state.players)

    // Community cards
    const commEl = document.getElementById("community")
    commEl.innerHTML = state.community.length
        ? state.community.map(c => cardHTML(c, false, "community-card")).join("")
        : '<span style="color:#ffffff33;font-size:.8em">Community cards</span>'

    // Pot
    document.getElementById("pot-label").textContent = state.pot > 0 ? `Pot: ${state.pot}` : ""

    // Players
    state.players.forEach(p => {
        const el = seatEl(p.seat)
        if (!el) return
        el.className = [
            "seat",
            p.isHuman ? "you" : "",
            p.active ? "active" : "",
            p.folded ? "folded" : "",
            p.dealer ? "dealer" : ""
        ].filter(Boolean).join(" ")

        const betText = p.committedHand > 0 ? `bet: ${p.committedHand}` : ""
        const cardsHtml = p.hole.map(c => cardHTML(c)).join("")

        el.innerHTML = `
            <div class="pname">${p.isHuman ? "YOU" : p.id}</div>
            <div class="pstack">${p.stack} chips</div>
            <div class="pbet">${betText}</div>
            <div class="cards">${cardsHtml}</div>
        `
    })

    // Controls
    const isHumanTurn = state.humanTurn
    const legal = state.legalActions || []
    const legalTypes = new Set(legal.map(a => a.type))

    const btnFold = document.getElementById("btn-fold")
    const btnCheck = document.getElementById("btn-check")
    const btnCall = document.getElementById("btn-call")
    const btnRaise = document.getElementById("btn-raise")
    const raiseInput = document.getElementById("raise-amount")
    const raiseHint = document.getElementById("raise-hint")

    btnFold.disabled = !isHumanTurn || !legalTypes.has("fold")
    btnCheck.disabled = !isHumanTurn || !legalTypes.has("check")
    btnCall.disabled = !isHumanTurn || !legalTypes.has("call")
    btnRaise.disabled = !isHumanTurn || !legalTypes.has("raise")

    if (isHumanTurn && legalTypes.has("raise")) {
        const r = legal.find(a => a.type === "raise")
        raiseInput.style.display = ""
        raiseInput.min = r.min; raiseInput.max = r.max
        if (!raiseInput.value || +raiseInput.value < r.min) raiseInput.value = r.min
        raiseHint.textContent = `(${r.min}–${r.max})`
    } else {
        raiseInput.style.display = "none"
        raiseHint.textContent = ""
    }

    // Call button label
    if (isHumanTurn && legalTypes.has("call")) {
        const callAction = legal.find(a => a.type === "call")
        btnCall.textContent = callAction ? `Call ${callAction.amount}` : "Call"
    } else {
        btnCall.textContent = "Call"
    }

    // Status
    const statusEl = document.getElementById("action-status")
    if (state.stage === "idle") statusEl.textContent = "Waiting for next hand…"
    else if (isHumanTurn) statusEl.textContent = "Your turn!"
    else if (state.currentTurn) statusEl.textContent = `${state.currentTurn} is thinking…`
    else statusEl.textContent = ""

    // Log
    const logEl = document.getElementById("log")
    logEl.innerHTML = (state.log || []).map(entry =>
        `<div class="entry ${entry.divider ? "divider" : ""} ${entry.player === "human" ? "you" : ""}">${entry.text}</div>`
    ).join("")
    logEl.scrollTop = logEl.scrollHeight

    // Hand result overlay
    const overlay = document.getElementById("result-overlay")
    if (state.handResult && state.stage === "idle") {
        const r = state.handResult
        document.getElementById("result-title").textContent =
            r.winners?.[0]?.id === "human" ? "🎉 You win!" : `${r.winners?.[0]?.id} wins`
        let body = `<div>Pot: ${r.winners?.[0]?.amount ?? state.pot}</div>`
        if (r.showdown && r.revealed) {
            body += r.revealed.map(rv =>
                `<div class="reveal">${rv.id}: ${rv.hole.join(" ")} — ${rv.handLabel}</div>`
            ).join("")
        }
        document.getElementById("result-body").innerHTML = body
        overlay.classList.add("visible")
    } else {
        overlay.classList.remove("visible")
    }
}

// ── State Polling ─────────────────────────────────────────────────────────────
let lastStage = null
let polling = false

async function fetchState() {
    const res = await fetch(`${API}/api/play/state`)
    return res.json()
}

async function pollLoop() {
    if (polling) return
    polling = true
    while (true) {
        try {
            const state = await fetchState()
            render(state)
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 600))
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function sendAction(action) {
    document.getElementById("btn-fold").disabled = true
    document.getElementById("btn-check").disabled = true
    document.getElementById("btn-call").disabled = true
    document.getElementById("btn-raise").disabled = true
    try {
        await fetch(`${API}/api/play/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action })
        })
    } catch (e) { console.error(e) }
}

document.getElementById("btn-fold").addEventListener("click", () => sendAction({ type: "fold" }))
document.getElementById("btn-check").addEventListener("click", () => sendAction({ type: "check" }))
document.getElementById("btn-call").addEventListener("click", () => sendAction({ type: "call" }))
document.getElementById("btn-raise").addEventListener("click", () => {
    const amount = parseInt(document.getElementById("raise-amount").value, 10)
    sendAction({ type: "raise", amount })
})

document.getElementById("btn-next").addEventListener("click", () => {
    document.getElementById("result-overlay").classList.remove("visible")
})

// ── New Game ──────────────────────────────────────────────────────────────────
async function newGame() {
    document.getElementById("info-bar").textContent = "Starting new game…"
    document.getElementById("result-overlay").classList.remove("visible")
    try {
        const res = await fetch(`${API}/api/play/new`, { method: "POST" })
        const data = await res.json()
        document.getElementById("info-bar").textContent = data.info || "Game started"
    } catch (e) {
        document.getElementById("info-bar").textContent = "Failed to start game"
    }
}

document.getElementById("btn-new").addEventListener("click", newGame)

// ── Boot ──────────────────────────────────────────────────────────────────────
;(async () => {
    // Try to load existing game first
    const state = await fetchState().catch(() => null)
    if (state && state.started === false) {
        document.getElementById("info-bar").textContent = "No game — click 'New Game' to start"
    } else {
        document.getElementById("info-bar").textContent = "Connected"
    }
    pollLoop()
})()
