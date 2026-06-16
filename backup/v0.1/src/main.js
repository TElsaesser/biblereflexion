import { renderConsent } from './phases/consent.js'
import { renderChat } from './phases/chat.js'
import { renderSummary } from './phases/summary.js'
import { renderBible } from './phases/bible.js'

let loggingEnabled = false

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

startConsent()
