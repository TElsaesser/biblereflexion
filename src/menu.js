import { marked } from 'marked'

// marked konfigurieren: GFM, saubere IDs, kein Sanitize (wir kontrollieren den Input)
marked.setOptions({ gfm: true, breaks: false })

export function loadAiInfo() {
  // KI-Status + Geo
  fetch('/api/info')
    .then(r => r.json())
    .then(info => {
      const modelEl        = document.getElementById('ai-info-model')
      const proxyVal       = document.getElementById('ai-info-proxy-val')
      const proxyLocRow    = document.getElementById('ai-info-proxy-location-row')
      const proxyLocVal    = document.getElementById('ai-info-proxy-location')
      const upstreamEl     = document.getElementById('ai-info-upstream')
      const upstreamVal    = document.getElementById('ai-info-upstream-val')
      const upstreamLocRow = document.getElementById('ai-info-upstream-location-row')
      const upstreamLocVal = document.getElementById('ai-info-upstream-location-val')
      const statusEl       = document.getElementById('ai-info-status')

      if (modelEl) modelEl.textContent = info.configured_model
      if (proxyVal) proxyVal.textContent = info.configured_provider

      if (info.proxy_geo && proxyLocRow) {
        proxyLocVal.textContent = `${info.proxy_geo.location}${info.proxy_geo.org ? ' · ' + info.proxy_geo.org : ''}`
        proxyLocRow.style.display = 'flex'
      }

      if (info.upstream_url && upstreamEl) {
        upstreamVal.textContent = info.upstream_url
        upstreamEl.style.display = 'flex'

        if (info.upstream_geo && upstreamLocRow) {
          upstreamLocVal.textContent = `${info.upstream_geo.location}${info.upstream_geo.org ? ' · ' + info.upstream_geo.org : ''}`
          upstreamLocRow.style.display = 'flex'
        }

        const upModelRow = document.getElementById('ai-info-upstream-model-row')
        const upModelVal = document.getElementById('ai-info-upstream-model-val')
        if (info.upstream_model && info.upstream_model !== info.configured_model && upModelRow) {
          upModelVal.textContent = info.upstream_model
          upModelRow.style.display = 'flex'
        }
      }

      if (statusEl) {
        statusEl.innerHTML = info.reachable
          ? `<span class="ai-status-dot ai-status-ok"></span> Erreichbar (${info.latency_ms} ms)`
          : `<span class="ai-status-dot ai-status-err"></span> Nicht erreichbar`
      }
    })
    .catch(() => {
      const statusEl = document.getElementById('ai-info-status')
      if (statusEl) statusEl.innerHTML = `<span class="ai-status-dot ai-status-err"></span> Nicht erreichbar`
    })

  // Tages-Statistik
  fetch('/api/stats')
    .then(r => r.json())
    .then(stats => {
      const linkEl = document.getElementById('ai-stats-link')
      if (!linkEl) return
      linkEl.textContent = `Heute: ${stats.today}`
      linkEl.addEventListener('click', e => {
        e.preventDefault()
        showStatsModal(stats.history)
      })
    })
    .catch(() => {
      const linkEl = document.getElementById('ai-stats-link')
      if (linkEl) linkEl.textContent = 'Heute: —'
    })
}

function showStatsModal(history) {
  const existing = document.getElementById('stats-modal')
  if (existing) existing.remove()

  const total = history.reduce((s, d) => s + d.count, 0)

  const modal = document.createElement('div')
  modal.id = 'stats-modal'
  modal.className = 'stats-modal'
  modal.innerHTML = `
    <div class="stats-modal-box">
      <div class="stats-modal-header">
        <span>Reflexionen gesamt: <strong>${total}</strong></span>
        <button class="menu-close" id="stats-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="stats-modal-body">
        <table class="stats-table">
          <thead><tr><th>Datum</th><th>Reflexionen</th></tr></thead>
          <tbody>
            ${history.map(d => `<tr><td>${d.date}</td><td>${d.count}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="stats-modal-backdrop"></div>
  `
  document.body.appendChild(modal)
  document.getElementById('stats-close').addEventListener('click', () => modal.remove())
  modal.querySelector('.stats-modal-backdrop').addEventListener('click', () => modal.remove())
}

const DOCS = [
  { id: 'user-guide',    label: 'Benutzerhandbuch',            path: '/docs/USER_GUIDE.md' },
  { id: 'tech-overview', label: 'Technische Konzeptbeschreibung', path: '/docs/TECHNICAL_OVERVIEW.md' },
  { id: 'dev-guide',     label: 'Developer Guide',             path: '/docs/DEVELOPER_GUIDE.md' },
]

let menuOpen = false
let menuBar  = null

export function initMenu() {
  // Menü-Bar ins DOM einfügen (einmalig, persistent über alle Phasen)
  menuBar = document.createElement('div')
  menuBar.className = 'menu-bar'
  menuBar.innerHTML = `
    <div class="menu-bar-inner">
      <span class="menu-app-name">MeinBibelKompass</span>
      <button class="menu-toggle" id="menu-toggle" aria-label="Menü öffnen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  `
  document.body.prepend(menuBar)

  // Overlay
  const overlay = document.createElement('div')
  overlay.className = 'menu-overlay'
  overlay.id = 'menu-overlay'
  overlay.innerHTML = `
    <div class="menu-drawer" id="menu-drawer">
      <div class="menu-drawer-header">
        <span class="menu-drawer-title">MeinBibelKompass</span>
        <button class="menu-close" id="menu-close" aria-label="Menü schließen">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <nav class="menu-nav">
        <div class="menu-section-label">Dokumentation</div>
        ${DOCS.map(d => `
          <button class="menu-item" data-doc="${d.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${d.label}
          </button>
        `).join('')}
        <div class="menu-divider"></div>
        <button class="menu-item" data-doc="impressum">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Impressum
        </button>
      </nav>
    </div>
    <div class="menu-backdrop" id="menu-backdrop"></div>
  `
  document.body.appendChild(overlay)

  // Doc-Reader (separates Overlay)
  const reader = document.createElement('div')
  reader.className = 'doc-reader'
  reader.id = 'doc-reader'
  reader.innerHTML = `
    <div class="doc-reader-header">
      <button class="doc-reader-back" id="doc-reader-back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Zurück
      </button>
      <span class="doc-reader-title" id="doc-reader-title"></span>
    </div>
    <div class="doc-reader-content" id="doc-reader-content">
      <div class="loading-container"><div class="loading-spinner"></div></div>
    </div>
  `
  document.body.appendChild(reader)

  // Events
  document.getElementById('menu-toggle').addEventListener('click', openMenu)
  document.getElementById('menu-close').addEventListener('click', closeMenu)
  document.getElementById('menu-backdrop').addEventListener('click', closeMenu)
  document.getElementById('doc-reader-back').addEventListener('click', () => {
    document.getElementById('doc-reader').classList.remove('open')
    openMenu()
  })

  overlay.querySelectorAll('.menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.doc
      closeMenu()
      openDoc(docId)
    })
  })
}

function openMenu() {
  menuOpen = true
  document.getElementById('menu-overlay').classList.add('open')
  document.body.style.overflow = 'hidden'
}

function closeMenu() {
  menuOpen = false
  document.getElementById('menu-overlay').classList.remove('open')
  document.body.style.overflow = ''
}

async function openDoc(docId) {
  const reader  = document.getElementById('doc-reader')
  const content = document.getElementById('doc-reader-content')
  const title   = document.getElementById('doc-reader-title')

  reader.classList.add('open')
  document.body.style.overflow = 'hidden'

  if (docId === 'impressum') {
    title.textContent = 'Impressum'
    content.innerHTML = getImpressum()
    return
  }

  const doc = DOCS.find(d => d.id === docId)
  if (!doc) return
  title.textContent = doc.label
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div></div>'

  try {
    const res  = await fetch(doc.path)
    if (!res.ok) throw new Error('Nicht gefunden')
    const text = await res.text()
    content.innerHTML = `<div class="doc-markdown">${marked.parse(text)}</div>`
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);padding:20px;">Dokument konnte nicht geladen werden.</p>`
  }
}

function getImpressum() {
  return `
    <div class="impressum">
      <h2>Impressum</h2>
      <p>Angaben gemäß § 5 TMG</p>

      <h3>Verantwortlich</h3>
      <p>
        Thomas Elsässer<br>
        Arndtstr. 17<br>
        68766 Hockenheim
      </p>

      <h3>Kontakt</h3>
      <p>
        E-Mail: <a href="mailto:thomas.elsaesser@gmx.de">thomas.elsaesser@gmx.de</a>
      </p>

      <h3>Hinweis zur KI-Nutzung</h3>
      <p>
        Diese Anwendung nutzt KI-Sprachmodelle zur Gesprächsführung und zur
        Auswahl von Bibelstellen. Die generierten Deutungen und Erklärungen
        stellen keine theologische oder seelsorgerliche Beratung dar.
      </p>

      <h3>Bibeltext</h3>
      <p>
        Die verwendeten Bibeltexte stammen aus der
        <strong>Elberfelder Bibel 2006</strong> (Quadro-Bibel 5.0),
        bereitgestellt über <a href="https://bibel.github.io/ELB2006/" target="_blank" rel="noopener">bibel.github.io/ELB2006</a>.
        Alle Rechte am Bibeltext liegen bei den jeweiligen Rechteinhabern.
      </p>

      <h3>Haftungsausschluss</h3>
      <p>
        Die Inhalte dieser Seite wurden mit größtmöglicher Sorgfalt erstellt.
        Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte kann
        jedoch keine Gewähr übernommen werden. Als Diensteanbieter bin ich
        gemäß § 7 Abs. 1 TMG für eigene Inhalte verantwortlich.
      </p>

      <h3>Datenschutz</h3>
      <p>
        Diese Anwendung speichert keine personenbezogenen Daten auf dem Server.
        Gesprächsprotokolle werden ausschließlich lokal im Browser des Nutzers
        gespeichert und nicht übertragen. Texteingaben werden zur Verarbeitung
        an eine externe KI-API weitergeleitet, jedoch ohne Nutzerzuordnung.
      </p>
    </div>
  `
}
