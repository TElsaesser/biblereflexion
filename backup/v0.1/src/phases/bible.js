import { fetchVerses, renderVerses } from '../bible-parser.js'
import { exportSession, logResult, isLoggingEnabled } from '../logger.js'
import QRCode from 'qrcode'

export async function renderBible(data, loggingEnabled) {
  const { summary, passages } = data

  // Ergebnis ins Log schreiben (falls aktiviert)
  logResult(data)

  const app = document.getElementById('app')

  const passageCardsHtml = passages.map((p, i) => `
    <div class="bible-card">
      <div class="bible-card-header">
        <div class="bible-card-number">${i + 1}</div>
        <div class="bible-card-header-text">
          ${p.title ? `<div class="bible-card-title">${p.title}</div>` : ''}
          <div class="bible-card-ref">${p.reference}</div>
        </div>
      </div>
      <div class="bible-card-body">
        <div class="bible-text" id="bible-text-${i}">
          <p class="bible-verse-loading">Bibeltext wird geladen…</p>
        </div>
        <div class="bible-explanation">
          <div class="bible-explanation-label">Was dieser Text mir sagt</div>
          <p class="bible-explanation-text">${p.explanation}</p>
        </div>
      </div>
    </div>
  `).join('')

  app.innerHTML = `
    <div class="phase">
      <div class="app-header">
        <div class="app-title">Deine Reflexion</div>
        <div class="app-subtitle">Bibel &amp; Reflexion mit KI-Unterstützung</div>
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
          <button class="btn-secondary" id="export-btn">
            <span>Protokoll als JSON herunterladen</span>
          </button>
        ` : ''}
        <div class="qr-section">
          <h3>Diese App teilen</h3>
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
    width: 160,
    margin: 1,
    color: { dark: '#1a3028', light: '#ffffff' }
  })

  passages.forEach(async (p, i) => {
    const container = document.getElementById(`bible-text-${i}`)
    try {
      const verses = await fetchVerses(p.testament, p.book, p.chapter, p.startVerse, p.endVerse)
      container.innerHTML = renderVerses(verses)
    } catch {
      container.innerHTML = `<p class="bible-verse-loading">Bibeltext konnte nicht geladen werden.</p>`
    }
  })
}
