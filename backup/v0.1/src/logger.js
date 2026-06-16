let session = null
let enabled = false

function timestamp() {
  return new Date().toISOString()
}

function filenameTimestamp() {
  // "2026-06-15_14-32-07" — sicher für Dateinamen
  return new Date().toISOString().replace(/:/g, '-').replace('T', '_').slice(0, 19)
}

function deviceContext() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    platform: navigator.platform || 'unknown',
  }
}

export function initLogger(loggingEnabled) {
  enabled = loggingEnabled
  session = {
    sessionId: filenameTimestamp(),
    startedAt: timestamp(),
    loggingEnabled,
    device: loggingEnabled ? deviceContext() : null,
    events: [],
    chat: [],          // geordnete Chat-Nachrichtenliste
    result: null,      // Auswertungs-Ergebnis am Ende
  }
}

export function logEvent(type, data) {
  if (!enabled || !session) return
  session.events.push({ type, timestamp: timestamp(), data })

  // Chat-Nachrichten extra strukturiert mitführen
  if (type === 'question') {
    session.chat.push({ role: 'assistant', n: data.n, text: data.question, timestamp: timestamp() })
  }
  if (type === 'answer') {
    session.chat.push({ role: 'user', n: data.n, text: data.answer, timestamp: timestamp() })
  }
  if (type === 'reflect_result') {
    session.result = data
  }
}

export function logResult(data) {
  if (!enabled || !session) return
  session.result = {
    summary: data.summary,
    passages: data.passages.map(p => ({
      reference: p.reference,
      explanation: p.explanation,
    })),
    savedAt: timestamp(),
  }
}

export function exportSession() {
  if (!enabled || !session) return

  session.exportedAt = timestamp()
  session.durationSeconds = Math.round(
    (new Date(session.exportedAt) - new Date(session.startedAt)) / 1000
  )

  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reflexion_${session.sessionId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function isLoggingEnabled() {
  return enabled
}
