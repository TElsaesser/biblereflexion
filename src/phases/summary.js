import { logEvent } from '../logger.js'

export async function renderSummary(messages, onReady) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="phase">
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p class="loading-text">Deine Reflexion wird zusammengestellt…</p>
        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Das kann einen Moment dauern.</p>
      </div>
    </div>
  `

  try {
    const res = await fetch('/api/reflect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    })
    if (!res.ok) throw new Error('API-Fehler')
    const data = await res.json()
    logEvent('reflect_result', { summary: data.summary, passages: data.passages.map(p => p.reference) })
    onReady(data)
  } catch (err) {
    app.innerHTML = `
      <div class="phase">
        <div class="loading-container">
          <p style="color:red;">Fehler beim Laden der Auswertung. Bitte Seite neu laden.</p>
          <button class="btn-secondary" style="max-width:200px; margin-top:16px;" onclick="location.reload()">Neu starten</button>
        </div>
      </div>
    `
  }
}
