import { fetchVerses, renderVerses } from '../bible-parser.js'
import { exportSession, logResult } from '../logger.js'
import QRCode from 'qrcode'

// Ganzes Kapitel laden
async function fetchFullChapter(testament, book, chapter) {
  const url = `/ELB2006-RoundtripHTML/${testament}/${book}_${chapter}.html`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Kapitel nicht gefunden')
  const html = await res.text()
  const doc  = new DOMParser().parseFromString(html, 'text/html')
  const verses = []
  let currentHeading = null
  let v = 1
  while (true) {
    const div = doc.querySelector(`#v${v}`)
    if (!div) break
    const h3 = div.querySelector('h3')
    if (h3) currentHeading = h3.textContent.trim()
    const clone = div.cloneNode(true)
    clone.querySelectorAll('sup.fnm, h3, .br-p').forEach(el => el.remove())
    clone.querySelector('.vn')?.remove()
    const text = clone.textContent.trim()
    if (text) verses.push({ verse: v, text, heading: currentHeading })
    currentHeading = null
    v++
  }
  return verses
}

// SSE-Enrich-Call
async function callEnrich(type, passage, summary) {
  const res = await fetch('/api/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, passage, summary })
  })
  if (!res.ok) throw new Error('Enrich-Fehler')
  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      return JSON.parse(line.slice(6).trim())
    }
  }
  throw new Error('Kein Ergebnis')
}

function spinnerHTML(id) {
  return `<div class="enrich-loading" id="${id}"><div class="loading-spinner" style="width:20px;height:20px;border-width:2px;"></div><span>Wird geladen…</span></div>`
}

export async function renderBible(data, loggingEnabled) {
  const { summary, passages } = data
  logResult(data)

  const app = document.getElementById('app')

  const passageCardsHtml = passages.map((p, i) => `
    <div class="bible-card" id="card-${i}">
      <div class="bible-card-header">
        <div class="bible-card-number">${i + 1}</div>
        <div class="bible-card-header-text">
          ${p.title ? `<div class="bible-card-title">${p.title}</div>` : ''}
          <div class="bible-card-ref">${p.reference}</div>
        </div>
      </div>
      <div class="bible-card-body">

        <!-- Bibeltext (Auszug) -->
        <div class="bible-text" id="bible-text-${i}">
          <p class="bible-verse-loading">Bibeltext wird geladen…</p>
        </div>

        <!-- Ganzes Kapitel (aufklappbar) -->
        <div class="enrich-section" id="chapter-section-${i}" style="display:none">
          <div class="bible-text bible-text-full" id="bible-chapter-${i}"></div>
        </div>

        <!-- Aktions-Buttons -->
        <div class="enrich-actions">
          <button class="enrich-btn" id="btn-chapter-${i}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            Ganzes Kapitel
          </button>
          <button class="enrich-btn" id="btn-reasoning-${i}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Warum diese Stelle?
          </button>
          <button class="enrich-btn" id="btn-history-${i}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            Historische Einordnung
          </button>
          <button class="enrich-btn" id="btn-chat-${i}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Fragen stellen
          </button>
        </div>

        <!-- Deutung (immer sichtbar) -->
        <div class="bible-explanation">
          <div class="bible-explanation-label">Was dieser Text mir sagt</div>
          <p class="bible-explanation-text">${p.explanation}</p>
        </div>

        <!-- Begründung (on-demand) -->
        <div class="enrich-section" id="reasoning-section-${i}" style="display:none">
          <div class="enrich-content" id="reasoning-content-${i}"></div>
        </div>

        <!-- Historische Einordnung (on-demand) -->
        <div class="enrich-section" id="history-section-${i}" style="display:none">
          <div class="enrich-content" id="history-content-${i}"></div>
        </div>

        <!-- Chat (on-demand) -->
        <div class="enrich-section passage-chat-section" id="chat-section-${i}" style="display:none">
          <div class="passage-chat-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Gespräch zu dieser Bibelstelle
          </div>
          <div class="passage-chat-messages" id="passage-chat-messages-${i}"></div>
          <div class="passage-chat-input-row">
            <textarea class="passage-chat-input" id="passage-chat-input-${i}"
                      placeholder="Deine Frage …" rows="1"></textarea>
            <button class="passage-chat-send" id="passage-chat-send-${i}" disabled aria-label="Senden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>

      </div>
    </div>
  `).join('')

  app.innerHTML = `
    <div class="phase">
      <div class="app-header">
        <div class="app-title">MeinBibelKompass</div>
        <div class="app-subtitle">Deine persönliche Reflexion</div>
      </div>
      <div class="results-container">
        <div class="summary-card">
          <div class="summary-label">Deine Situation</div>
          <p class="summary-text">${summary}</p>
        </div>

        <p class="bible-section-title">Drei Bibelstellen für dich</p>

        ${passageCardsHtml}
      </div>

      <div class="actions-row">
        ${loggingEnabled ? `
          <button class="btn-secondary" id="export-btn">Protokoll herunterladen</button>
        ` : ''}
        <div class="qr-section">
          <h3>MeinBibelKompass teilen</h3>
          <p>Scanne diesen QR-Code, um die App auf einem anderen Gerät zu öffnen</p>
          <canvas id="qr-canvas"></canvas>
        </div>
        <button class="btn-secondary" onclick="location.reload()">Neue Reflexion starten</button>
      </div>
    </div>
  `

  if (loggingEnabled) {
    document.getElementById('export-btn')?.addEventListener('click', exportSession)
  }

  QRCode.toCanvas(document.getElementById('qr-canvas'), window.location.origin, {
    width: 160, margin: 1, color: { dark: '#1a3028', light: '#ffffff' }
  })

  // ── Bibeltext-Auszüge laden ────────────────────────────────────────
  passages.forEach(async (p, i) => {
    const container = document.getElementById(`bible-text-${i}`)
    try {
      const verses = await fetchVerses(p.testament, p.book, p.chapter, p.startVerse, p.endVerse)
      container.innerHTML = renderVerses(verses)
    } catch {
      container.innerHTML = `<p class="bible-verse-loading">Bibeltext konnte nicht geladen werden.</p>`
    }
  })

  // ── On-demand: ganzes Kapitel ────────────────────────────────────
  passages.forEach((p, i) => {
    const btn     = document.getElementById(`btn-chapter-${i}`)
    const section = document.getElementById(`chapter-section-${i}`)
    const content = document.getElementById(`bible-chapter-${i}`)
    let loaded = false

    btn.addEventListener('click', async () => {
      const open = section.style.display !== 'none' && loaded
      if (open) {
        section.style.display = 'none'
        btn.classList.remove('active')
        btn.querySelector('svg').style.transform = ''
        return
      }

      section.style.display = 'block'
      btn.classList.add('active')
      btn.querySelector('svg').style.transform = 'rotate(180deg)'

      if (!loaded) {
        content.innerHTML = spinnerHTML(`chapter-spinner-${i}`)
        try {
          const verses = await fetchFullChapter(p.testament, p.book, p.chapter)
          content.innerHTML = renderVerses(verses)
          // Aktuelle Verse hervorheben
          for (let v = p.startVerse; v <= p.endVerse; v++) {
            content.querySelectorAll('.bible-verse').forEach(el => {
              if (el.querySelector('.bible-verse-num')?.textContent == v) {
                el.classList.add('highlighted-verse')
              }
            })
          }
          loaded = true
        } catch {
          content.innerHTML = `<p class="bible-verse-loading">Kapitel konnte nicht geladen werden.</p>`
        }
      }
    })
  })

  // ── On-demand: Begründung ────────────────────────────────────────
  passages.forEach((p, i) => {
    const btn     = document.getElementById(`btn-reasoning-${i}`)
    const section = document.getElementById(`reasoning-section-${i}`)
    const content = document.getElementById(`reasoning-content-${i}`)
    let loaded = false

    btn.addEventListener('click', async () => {
      if (section.style.display !== 'none' && loaded) {
        section.style.display = 'none'
        btn.classList.remove('active')
        return
      }
      section.style.display = 'block'
      btn.classList.add('active')

      if (!loaded) {
        content.innerHTML = spinnerHTML(`reasoning-spinner-${i}`)
        try {
          const result = await callEnrich('reasoning', p, summary)
          content.innerHTML = `
            <div class="enrich-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Warum diese Stelle für dich
            </div>
            <p class="enrich-text">${result.text || result.error || 'Fehler beim Laden'}</p>
          `
          loaded = true
        } catch {
          content.innerHTML = `<p class="bible-verse-loading">Fehler beim Laden.</p>`
        }
      }
    })
  })

  // ── On-demand: historische Einordnung ───────────────────────────
  passages.forEach((p, i) => {
    const btn     = document.getElementById(`btn-history-${i}`)
    const section = document.getElementById(`history-section-${i}`)
    const content = document.getElementById(`history-content-${i}`)
    let loaded = false

    btn.addEventListener('click', async () => {
      if (section.style.display !== 'none' && loaded) {
        section.style.display = 'none'
        btn.classList.remove('active')
        return
      }
      section.style.display = 'block'
      btn.classList.add('active')

      if (!loaded) {
        content.innerHTML = spinnerHTML(`history-spinner-${i}`)
        try {
          const result = await callEnrich('history', p, summary)
          if (result.error) throw new Error(result.error)
          content.innerHTML = `
            <div class="history-block">
              <div class="enrich-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Historisch gesichert
              </div>
              <p class="enrich-text">${result.historical}</p>
            </div>
            <div class="history-block">
              <div class="enrich-label">Interpretationen &amp; Auslegungen</div>
              <p class="enrich-text">${result.interpretations}</p>
            </div>
            <div class="history-block">
              <div class="enrich-label">Relevanz heute</div>
              <p class="enrich-text">${result.relevance}</p>
            </div>
          `
          loaded = true
        } catch {
          content.innerHTML = `<p class="bible-verse-loading">Fehler beim Laden.</p>`
        }
      }
    })
  })

  // ── On-demand: Passage-Chat ─────────────────────────────────────
  passages.forEach((p, i) => {
    const btn        = document.getElementById(`btn-chat-${i}`)
    const section    = document.getElementById(`chat-section-${i}`)
    const messagesEl = document.getElementById(`passage-chat-messages-${i}`)
    const inputEl    = document.getElementById(`passage-chat-input-${i}`)
    const sendBtn    = document.getElementById(`passage-chat-send-${i}`)
    const chatHistory = []
    let waiting = false

    function addBubble(text, role) {
      const div = document.createElement('div')
      div.className = `passage-bubble passage-bubble-${role === 'assistant' ? 'ai' : 'user'}`
      div.textContent = text
      messagesEl.appendChild(div)
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' })
      return div
    }

    btn.addEventListener('click', () => {
      const open = section.style.display !== 'none'
      section.style.display = open ? 'none' : 'block'
      btn.classList.toggle('active', !open)
      if (!open && chatHistory.length === 0) {
        addBubble('Stell mir eine Frage zu dieser Bibelstelle – oder zu dem, was dich dabei bewegt.', 'assistant')
        setTimeout(() => inputEl.focus(), 100)
      }
    })

    async function sendMessage() {
      const text = inputEl.value.trim()
      if (!text || waiting) return
      waiting = true

      addBubble(text, 'user')
      chatHistory.push({ role: 'user', content: text })
      inputEl.value = ''
      inputEl.style.height = 'auto'
      inputEl.disabled = true
      sendBtn.disabled = true

      const typingBubble = addBubble('…', 'assistant')

      try {
        const res = await fetch('/api/passage-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatHistory,
            passage: { ...p, text: p.text?.slice(0, 600) },
            summary,
            explanation: p.explanation
          })
        })

        if (!res.ok) throw new Error('API error')

        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = '', fullText = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n'); buf = lines.pop()
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const d = JSON.parse(line.slice(6).trim())
              if (d.done) break
              if (d.token) {
                fullText += d.token
                typingBubble.textContent = fullText
                messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' })
              }
            } catch {}
          }
        }

        chatHistory.push({ role: 'assistant', content: fullText })
      } catch {
        typingBubble.textContent = 'Entschuldige, es gab einen Fehler. Bitte versuche es erneut.'
      }

      inputEl.disabled = false
      sendBtn.disabled = false
      inputEl.focus()
      waiting = false
    }

    sendBtn.addEventListener('click', sendMessage)
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    })
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto'
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px'
      sendBtn.disabled = !inputEl.value.trim()
    })
  })
}
