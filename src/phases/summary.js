import { logEvent } from '../logger.js'

export async function renderSummary(messages, onReady) {
  const app = document.getElementById('app')

  function showLoading() {
    app.innerHTML = `
      <div class="phase">
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <p class="loading-text">Deine Reflexion wird zusammengestellt…</p>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">Das kann 20–40 Sekunden dauern.</p>
        </div>
      </div>
    `
  }

  async function load() {
    showLoading()
    try {
      const res = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      logEvent('reflect_result', { summary: data.summary, passages: data.passages.map(p => p.reference) })
      onReady(data)
    } catch (err) {
      const isTimeout = err.message.includes('504') || err.message.includes('fetch')
      app.innerHTML = `
        <div class="phase">
          <div class="loading-container" style="gap:16px;">
            <p style="font-size:1.5rem;">⏳</p>
            <p style="font-weight:600; color:var(--text);">
              ${isTimeout ? 'Die Auswertung hat zu lange gedauert.' : 'Es gab einen technischen Fehler.'}
            </p>
            <p style="font-size:0.85rem; color:var(--text-secondary); max-width:320px; text-align:center; line-height:1.6;">
              ${isTimeout
                ? 'Der KI-Server hat nicht rechtzeitig geantwortet. Bitte versuche es erneut – deine Antworten bleiben erhalten.'
                : 'Die Auswertung konnte nicht erstellt werden. Bitte versuche es nochmals.'}
            </p>
            <button class="btn-primary" id="retry-btn" style="max-width:220px;">
              Nochmal versuchen
            </button>
          </div>
        </div>
      `
      document.getElementById('retry-btn').addEventListener('click', load)
    }
  }

  load()
}
