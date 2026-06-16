const PASSWORD_KEY = 'mbk_auth'
// Passwort als einfacher Hash — nicht kryptographisch sicher, reicht für Workshop
const PASSWORD_HASH = btoa('Kompass2026')

export function isAuthenticated() {
  return sessionStorage.getItem(PASSWORD_KEY) === PASSWORD_HASH
}

export function renderPassword(onSuccess) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="phase password-phase">
      <div class="password-container">

        <div class="consent-hero">
          <div class="consent-glow-ring">
            <span class="consent-cross">✝</span>
          </div>
          <h1 class="consent-title">MeinBibelKompass</h1>
          <p class="consent-tagline">Dein persönlicher Wegweiser durch Gottes Wort</p>
        </div>

        <div class="password-box">
          <label class="password-label" for="password-input">Bitte Zugangscode eingeben</label>
          <div class="password-input-row">
            <input
              type="password"
              id="password-input"
              class="password-input"
              placeholder="Zugangscode …"
              autocomplete="current-password"
              autofocus
            />
            <button class="password-submit" id="password-submit" aria-label="Bestätigen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
          <p class="password-error" id="password-error" style="display:none">
            Falscher Zugangscode. Bitte versuche es erneut.
          </p>
        </div>

        <div class="consent-privacy-note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>
            Mit dem Starten erkläre ich mein Einverständnis, dass meine Texteingaben zur Verarbeitung
            anonym an eine externe KI übermittelt werden – ohne Nutzerzuordnung, ohne Speicherung auf
            dem Server. Mein Gesprächsverlauf und meine persönlichen Angaben verbleiben ansonsten
            ausschließlich im Speicher meines Browsers und werden nirgendwo gespeichert.
          </span>
        </div>
        </div>

        <p class="consent-footer">Kein Konto erforderlich &nbsp;·&nbsp; Zugangscode beim Veranstalter erfragen</p>
      </div>
    </div>
  `

  const input   = document.getElementById('password-input')
  const submit  = document.getElementById('password-submit')
  const errorEl = document.getElementById('password-error')

  function tryLogin() {
    const val = input.value.trim()
    if (!val) return
    if (btoa(val) === PASSWORD_HASH) {
      sessionStorage.setItem(PASSWORD_KEY, PASSWORD_HASH)
      onSuccess()
    } else {
      errorEl.style.display = 'block'
      input.value = ''
      input.focus()
      input.classList.add('password-input-error')
      setTimeout(() => input.classList.remove('password-input-error'), 600)
    }
  }

  submit.addEventListener('click', tryLogin)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryLogin()
  })
  input.addEventListener('input', () => {
    errorEl.style.display = 'none'
  })
}
