import { logEvent } from '../logger.js'

const SEEN_KEY = 'mbk_seen_sections'
const MAX_SEEN = 200

export function markSectionSeen(sectionId) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')
    if (!seen.includes(sectionId)) {
      seen.push(sectionId)
      if (seen.length > MAX_SEEN) seen.splice(0, seen.length - MAX_SEEN)
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    }
  } catch {}
}

export function getSeenSectionIds() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
}

const LOADING_MESSAGES = [
  'Deine Reflexion wird zusammengestellt…',
  'Bibelstellen werden ausgewählt…',
  'Persönliche Deutungen werden geschrieben…',
  'Fast fertig…',
]

export async function renderSummary(messages, onReady) {
  const app = document.getElementById('app')
  let msgIndex = 0
  let msgTimer = null

  function showLoading() {
    app.innerHTML = `
      <div class="phase">
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <p class="loading-text" id="loading-msg">${LOADING_MESSAGES[0]}</p>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">Das kann 1–2 Minuten dauern.</p>
        </div>
      </div>
    `
    msgIndex = 0
    msgTimer = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, LOADING_MESSAGES.length - 1)
      const el = document.getElementById('loading-msg')
      if (el) el.textContent = LOADING_MESSAGES[msgIndex]
    }, 18000)
  }

  function showError(load) {
    clearInterval(msgTimer)
    app.innerHTML = `
      <div class="phase">
        <div class="loading-container" style="gap:16px;">
          <p style="font-size:1.5rem;">⏳</p>
          <p style="font-weight:600; color:var(--text);">Die Auswertung hat zu lange gedauert.</p>
          <p style="font-size:0.85rem; color:var(--text-secondary); max-width:320px; text-align:center; line-height:1.6;">
            Bitte versuche es erneut – deine Antworten bleiben erhalten.
          </p>
          <button class="btn-primary" id="retry-btn" style="max-width:220px;">Nochmal versuchen</button>
        </div>
      </div>
    `
    document.getElementById('retry-btn').addEventListener('click', load)
  }

  async function load() {
    showLoading()
    try {
      const res = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          excludeIds: getSeenSectionIds()
        })
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // SSE-Stream lesen
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE-Zeilen parsen
        const lines = buffer.split('\n')
        buffer = lines.pop() // letztes unvollständiges Stück aufheben

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue

          const data = JSON.parse(payload)
          if (data.error) throw new Error(data.error)

          clearInterval(msgTimer)
          logEvent('reflect_result', { summary: data.summary, passages: data.passages.map(p => p.reference) })
          onReady(data)
          return
        }
      }

      throw new Error('Stream ended without data')
    } catch {
      showError(load)
    }
  }

  load()
}
