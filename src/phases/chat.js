import { logEvent, exportSession } from '../logger.js'

const MAX_QUESTIONS = 10

const OPENING_TOPICS = [
  { key: 'A', label: 'Unsicherheit oder Angst',                    icon: '😰' },
  { key: 'B', label: 'Erschöpfung oder Überforderung',             icon: '😮‍💨' },
  { key: 'C', label: 'Traurigkeit oder Verlust',                   icon: '💧' },
  { key: 'D', label: 'Sehnsucht nach Orientierung / Entscheidung', icon: '🧭' },
  { key: 'E', label: 'Dankbarkeit oder Freude',                    icon: '🌱' },
  { key: 'F', label: 'Schuld, Versagen oder Vergebung',            icon: '🤍' },
  { key: 'G', label: 'Einsamkeit oder Konflikte',                  icon: '🤝' },
  { key: 'H', label: 'Sehnsucht nach Gottes Nähe / Sinnfragen',   icon: '✨' },
  { key: 'I', label: 'Etwas anderes …',                            icon: '💬' },
]

export function renderChat(loggingEnabled, onComplete) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="phase chat-phase">
      <div class="chat-progress">
        <div class="progress-label">
          <span class="progress-step" id="progress-text">Schritt 1 von max. ${MAX_QUESTIONS}</span>
          <div class="progress-actions">
            <button class="finish-btn" id="finish-btn" style="display:none" title="Zum Ergebnis springen">
              Zum Ergebnis →
            </button>
            ${loggingEnabled ? `<button class="log-btn" id="log-btn" title="Protokoll herunterladen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Log
            </button>` : ''}
          </div>
        </div>
        <div class="chat-progress-bar">
          <div class="chat-progress-fill" id="progress-fill" style="width:10%"></div>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-wrapper">
        <div class="chat-input-inner">
          <textarea
            class="chat-input"
            id="chat-input"
            placeholder="Eigene Antwort eingeben …"
            rows="1"
            disabled
          ></textarea>
          <button class="chat-send" id="chat-send" disabled aria-label="Senden">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `

  if (loggingEnabled) {
    document.getElementById('log-btn')?.addEventListener('click', exportSession)
  }
  document.getElementById('finish-btn').addEventListener('click', () => {
    logEvent('chat_complete', { questionCount, messageCount: messages.length, early: true })
    onComplete(messages)
  })

  const messagesEl   = document.getElementById('chat-messages')
  const inputEl      = document.getElementById('chat-input')
  const sendBtn      = document.getElementById('chat-send')
  const progressText = document.getElementById('progress-text')
  const progressFill = document.getElementById('progress-fill')

  const messages = []
  let questionCount = 0
  let waiting = false

  function updateProgress() {
    progressText.textContent = `Schritt ${questionCount + 1} von max. ${MAX_QUESTIONS}`
    progressFill.style.width = `${Math.max(10, (questionCount / MAX_QUESTIONS) * 100)}%`
    const finishBtn = document.getElementById('finish-btn')
    if (finishBtn) finishBtn.style.display = questionCount >= 5 ? 'inline-flex' : 'none'
  }

  function scrollToBottom() {
    setTimeout(() => messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' }), 60)
  }

  function addBubble(role, text) {
    const div = document.createElement('div')
    div.className = `bubble bubble-${role === 'assistant' ? 'ai' : 'user'}`
    div.textContent = text
    messagesEl.appendChild(div)
    scrollToBottom()
    return div
  }

  function showTyping() {
    const div = document.createElement('div')
    div.className = 'bubble bubble-ai bubble-typing'
    div.id = 'typing-indicator'
    div.innerHTML = '<span></span><span></span><span></span>'
    messagesEl.appendChild(div)
    scrollToBottom()
  }

  function removeTyping() {
    document.getElementById('typing-indicator')?.remove()
  }

  function showSuggestions(suggestions) {
    removeSuggestions()
    if (!suggestions?.length) return

    const wrap = document.createElement('div')
    wrap.className = 'suggestions-wrap'
    wrap.id = 'suggestions-wrap'

    suggestions.forEach(s => {
      const btn = document.createElement('button')
      btn.className = 'suggestion-chip'
      btn.textContent = s
      btn.addEventListener('click', () => {
        if (waiting) return
        const isOther = s.toLowerCase().startsWith('etwas anderes')
        removeSuggestions()
        if (isOther) {
          inputEl.disabled = false
          sendBtn.disabled = false
          inputEl.focus()
        } else {
          commitAnswer(s)
        }
      })
      wrap.appendChild(btn)
    })

    messagesEl.appendChild(wrap)
    scrollToBottom()
  }

  function removeSuggestions() {
    document.getElementById('suggestions-wrap')?.remove()
  }

  function removeTopicGrid() {
    document.getElementById('topic-grid')?.remove()
  }

  function commitAnswer(text) {
    removeSuggestions()
    removeTopicGrid()
    addBubble('user', text)
    messages.push({ role: 'user', content: text })
    logEvent('answer', { n: questionCount, answer: text })
    inputEl.value = ''
    inputEl.style.height = 'auto'
    inputEl.disabled = true
    sendBtn.disabled = true

    if (questionCount >= MAX_QUESTIONS) {
      logEvent('chat_complete', { questionCount, messageCount: messages.length })
      onComplete(messages)
      return
    }
    askNext()
  }

  // ── Einstiegsfrage lokal ──────────────────────────────────────────
  function showOpeningQuestion() {
    const questionText = 'Was bewegt dich gerade am meisten? Wähle das Thema, das dir heute am nächsten ist – oder beschreibe es in eigenen Worten.'
    addBubble('assistant', questionText)
    messages.push({ role: 'assistant', content: questionText })
    questionCount = 1
    updateProgress()

    const grid = document.createElement('div')
    grid.className = 'topic-grid'
    grid.id = 'topic-grid'

    OPENING_TOPICS.forEach(t => {
      const btn = document.createElement('button')
      btn.className = 'topic-btn'
      btn.innerHTML = `<span class="topic-icon">${t.icon}</span><span class="topic-label">${t.label}</span>`
      btn.addEventListener('click', () => {
        if (waiting) return
        if (t.key === 'I') {
          removeTopicGrid()
          inputEl.disabled = false
          sendBtn.disabled = false
          inputEl.focus()
          return
        }
        removeTopicGrid()
        commitAnswer(t.label)
      })
      grid.appendChild(btn)
    })

    messagesEl.appendChild(grid)
    scrollToBottom()
  }

  // ── Adaptive Folgefragen via API ──────────────────────────────────
  async function askNext() {
    waiting = true
    inputEl.disabled = true
    sendBtn.disabled = true
    showTyping()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, questionCount })
      })
      if (!res.ok) throw new Error('API-Fehler')
      const data = await res.json()
      removeTyping()

      if (data.done) {
        logEvent('chat_complete', { questionCount, messageCount: messages.length })
        onComplete(messages)
        return
      }

      questionCount++
      updateProgress()
      addBubble('assistant', data.question)
      messages.push({ role: 'assistant', content: data.question })
      logEvent('question', { n: questionCount, question: data.question })

      showSuggestions(data.suggestions)
      inputEl.disabled = false
      sendBtn.disabled = false
    } catch {
      removeTyping()
      addBubble('assistant', 'Es gab einen technischen Fehler – bitte versuche es erneut.')
      inputEl.disabled = false
      sendBtn.disabled = false
    }
    waiting = false
  }

  // ── Input ─────────────────────────────────────────────────────────
  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim()
    if (text) commitAnswer(text)
  })
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = inputEl.value.trim()
      if (text) commitAnswer(text)
    }
  })
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto'
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'
    sendBtn.disabled = !inputEl.value.trim()
  })

  showOpeningQuestion()
}
