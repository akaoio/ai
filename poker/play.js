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
    // Seats s2,s3,s4 are in top row; s0,s1,s5 in bottom row.
    // All 6 are pre-created in HTML — this just handles unexpected extras.
    const topSeats = new Set([2, 3, 4])
    players.forEach(p => {
        if (!document.getElementById(`s${p.seat}`)) {
            const el = document.createElement("div")
            el.className = "seat"
            el.id = `s${p.seat}`
            const row = topSeats.has(p.seat) ? "top" : "bottom"
            const container = document.querySelector(`.seat-row.${row}`)
            if (container) container.appendChild(el)
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
        const badgeClass = p.allIn ? "act-allin" : p.lastAction ? (p.lastAction.startsWith("raise") ? "act-raise" : `act-${p.lastAction}`) : ""
        const badgeText  = p.allIn ? "ALL IN" : p.lastAction || ""

        el.innerHTML = `
            <div class="pname">${p.isHuman ? "YOU" : p.id}</div>
            <div class="pstack">${p.stack} chips</div>
            <div class="pbet">${betText}</div>
            <div class="paction-slot">${badgeText ? `<span class="paction ${badgeClass}">${badgeText}</span>` : ""}</div>
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
    const btnAllIn = document.getElementById("btn-allin")
    const raiseInput = document.getElementById("raise-amount")
    const raiseHint = document.getElementById("raise-hint")

    btnFold.disabled = !isHumanTurn || !legalTypes.has("fold")
    btnCheck.disabled = !isHumanTurn || !legalTypes.has("check")
    btnCall.disabled = !isHumanTurn || !legalTypes.has("call")
    btnRaise.disabled = !isHumanTurn || !legalTypes.has("raise")
    btnAllIn.disabled = !isHumanTurn || !legalTypes.has("raise")

    if (isHumanTurn && legalTypes.has("raise")) {
        const r = legal.find(a => a.type === "raise")
        raiseInput.style.display = ""
        raiseInput.min = r.min; raiseInput.max = r.max
        if (!raiseInput.value || +raiseInput.value < r.min) raiseInput.value = r.min
        raiseHint.textContent = `(${r.min}–${r.max})`
        btnAllIn.textContent = `All In ${r.max}`
    } else {
        raiseInput.style.display = "none"
        raiseHint.textContent = ""
        btnAllIn.textContent = "All In"
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
                `<div class="reveal"><span>${rv.id}:</span><span class="cards-inline">${rv.hole.map(c => cardHTML(c)).join("")}</span><span>— ${rv.handLabel}</span></div>`
            ).join("")
        }
        document.getElementById("result-body").innerHTML = body
        const btnNext = document.getElementById("btn-next")
        if (state.gameOver) {
            btnNext.textContent = "New Game"
            btnNext.onclick = () => {
                document.getElementById("result-overlay").classList.remove("visible")
                newGame()
            }
        } else {
            btnNext.textContent = "Next Hand ▶"
            btnNext.onclick = nextHand
        }
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
document.getElementById("btn-allin").addEventListener("click", () => {
    const r = document.getElementById("raise-amount")
    sendAction({ type: "raise", amount: parseInt(r.max, 10) })
})

async function nextHand() {
    document.getElementById("result-overlay").classList.remove("visible")
    try {
        const res = await fetch(`${API}/api/play/next-hand`, { method: "POST" })
        const state = await res.json()
        if (state.error) document.getElementById("info-bar").textContent = state.error
        else render(state)
    } catch (e) { console.error(e) }
}

document.getElementById("btn-next").addEventListener("click", nextHand)

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
