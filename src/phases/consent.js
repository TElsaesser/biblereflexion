import { initLogger } from '../logger.js'

export function renderConsent(onStart) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="phase consent-phase">
      <div class="consent-container">

        <div class="consent-hero">
          <div class="consent-glow-ring">
            <span class="consent-cross">✝</span>
          </div>
          <h1 class="consent-title">Bibel &amp; Reflexion</h1>
          <p class="consent-tagline">Ein stilles Gespräch mit dir selbst – begleitet von Gottes Wort</p>
        </div>

        <div class="consent-welcome-box">
          <p class="consent-welcome-text">
            Schön, dass du dir heute einen Moment nimmst.<br>
            In diesem Gespräch stellt dir eine KI einige einfühlsame Fragen zu dem, was dich gerade bewegt.
            Am Ende erhältst du <strong>drei passende Bibelstellen</strong> aus der Elberfelder Bibel –
            mit einem persönlichen Deutungstext, der zu deiner Situation spricht.
          </p>
          <ul class="consent-facts">
            <li><span class="fact-dot">·</span> Etwa 5–10 Minuten</li>
            <li><span class="fact-dot">·</span> Keine Registrierung</li>
            <li><span class="fact-dot">·</span> Kein Konto nötig</li>
          </ul>
        </div>

        <div class="consent-privacy-note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Dein Gespräch wird ausschließlich lokal in deinem Browser gespeichert. Am Ende kannst du es als Datei herunterladen. Es werden keine Daten auf Servern gespeichert.
        </div>

        <button class="btn-primary" id="start-btn">
          <span>Reflexion beginnen</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>

        <p class="consent-footer">Verarbeitung über anonyme API &nbsp;·&nbsp; Kein Nutzerkonto erforderlich</p>
      </div>
    </div>
  `

  document.getElementById('start-btn').addEventListener('click', () => {
    initLogger(true)
    onStart(true)
  })
}
