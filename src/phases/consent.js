import { initLogger } from '../logger.js'
import { loadAiInfo } from '../menu.js'

export function renderConsent(onStart) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="phase consent-phase">
      <div class="consent-container">

        <div class="consent-hero">
          <div class="consent-glow-ring">
            <span class="consent-cross">✝</span>
          </div>
          <h1 class="consent-title">MeinBibelKompass</h1>
          <p class="consent-tagline">Dein persönlicher Wegweiser durch Gottes Wort</p>
        </div>

        <div class="consent-welcome-box">
          <p class="consent-welcome-text">
            Schön, dass du hier bist.<br>
            <strong>MeinBibelKompass</strong> begleitet dich in einem kurzen, persönlichen Gespräch –
            und findet dann drei Bibelstellen aus der Elberfelder Bibel, die genau zu deiner
            aktuellen Lebenssituation passen. Mit persönlicher Deutung, historischer Einordnung
            und der Möglichkeit, den gesamten Kontext zu lesen.
          </p>
          <ul class="consent-facts">
            <li><span class="fact-dot">·</span> Etwa 5–10 Minuten</li>
            <li><span class="fact-dot">·</span> Keine Registrierung</li>
            <li><span class="fact-dot">·</span> KI-gestützte Bibelsuche</li>
          </ul>
        </div>

        <button class="btn-primary" id="start-btn">
          <span>Kompass starten</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>

        <div class="consent-privacy-note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>Dein Gespräch wird ausschließlich lokal in deinem Browser gespeichert. Am Ende kannst du es als Datei herunterladen. Es werden keine Daten auf Servern gespeichert.</span>
        </div>

        <div class="ai-info-card" id="ai-info-card">
          <div class="ai-info-row">
            <span class="ai-info-label">KI-Proxy</span>
            <span class="ai-info-value" id="ai-info-proxy-val">https://ai.ytels.de</span>
          </div>
          <div class="ai-info-row" id="ai-info-proxy-location-row" style="display:none">
            <span class="ai-info-label">↳ Standort</span>
            <span class="ai-info-value" id="ai-info-proxy-location">—</span>
          </div>
          <div class="ai-info-row" id="ai-info-upstream" style="display:none">
            <span class="ai-info-label">Anbieter</span>
            <span class="ai-info-value" id="ai-info-upstream-val">—</span>
          </div>
          <div class="ai-info-row" id="ai-info-upstream-location-row" style="display:none">
            <span class="ai-info-label">↳ Standort</span>
            <span class="ai-info-value" id="ai-info-upstream-location-val">—</span>
          </div>
          <div class="ai-info-row" id="ai-info-upstream-model-row" style="display:none">
            <span class="ai-info-label">↳ Modell</span>
            <span class="ai-info-value" id="ai-info-upstream-model-val">—</span>
          </div>
          <div class="ai-info-row">
            <span class="ai-info-label">Modell</span>
            <span class="ai-info-value" id="ai-info-model">deepseek-ai/DeepSeek-V4-Flash</span>
          </div>
          <div class="ai-info-row">
            <span class="ai-info-label">Status</span>
            <span class="ai-info-value" id="ai-info-status">
              <span class="ai-status-dot ai-status-pending"></span> Wird geprüft…
            </span>
          </div>
        </div>

        <p class="consent-footer">Verarbeitung über anonyme API &nbsp;·&nbsp; Kein Nutzerkonto erforderlich</p>
      </div>
    </div>
  `

  loadAiInfo()

  document.getElementById('start-btn').addEventListener('click', () => {
    initLogger(true)
    onStart(true)
  })
}
