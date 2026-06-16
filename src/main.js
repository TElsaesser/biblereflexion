import { renderConsent } from './phases/consent.js'
import { renderChat } from './phases/chat.js'
import { renderSummary } from './phases/summary.js'
import { renderBible } from './phases/bible.js'
import { renderPassword, isAuthenticated } from './phases/password.js'
import { initMenu } from './menu.js'

let loggingEnabled = false

function start() {
  if (!isAuthenticated()) {
    renderPassword(() => {
      initMenu()
      startConsent()
    })
  } else {
    initMenu()
    startConsent()
  }
}

function startConsent() {
  renderConsent((logging) => {
    loggingEnabled = logging
    startChat()
  })
}

function startChat() {
  renderChat(loggingEnabled, (messages) => {
    startSummary(messages)
  })
}

function startSummary(messages) {
  renderSummary(messages, (data) => {
    renderBible(data, loggingEnabled)
  })
}

start()
