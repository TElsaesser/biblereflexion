const ONE_API_BASE = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY = process.env.ONE_API_KEY || ''
const MODEL = process.env.ONE_API_MODEL || 'gpt-4o'

const SYSTEM_PROMPT = `Du bist ein ruhiger, geistlicher Reflexionsassistent.
Du führst einen Menschen durch maximal 10 adaptive Fragen zu seiner aktuellen Lebenssituation.

REGELN:
- Stelle immer nur 1 Frage gleichzeitig
- Passe jede Frage an die vorherigen Antworten an
- Bleibe ruhig, nicht therapeutisch, nicht wertend

AUSGABE-FORMAT – ZWINGEND:
Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt. KEIN Text davor, KEIN Text danach, KEINE Erklärungen, KEIN Markdown.

Nächste Frage:
{"question":"...","suggestions":["...","...","...","...","...","...","...","...","...","..."]}

suggestions: genau 10 kurze Antwortvorschläge (2–6 Wörter) passend zu dieser Frage.

Gesprächsende (nach mind. 5 Fragen):
{"done":true}`

async function callAI(messages) {
  const effectiveMessages = messages.length > 0
    ? messages
    : [{ role: 'user', content: 'Bitte stelle mir die erste Einstiegsfrage.' }]

  // JSON-Anforderung als letzte User-Message anhängen — DeepSeek befolgt das zuverlässiger als System-Prompt
  const lastMsg = effectiveMessages[effectiveMessages.length - 1]
  const jsonReminder = lastMsg.role === 'user'
    ? [...effectiveMessages.slice(0, -1), {
        role: 'user',
        content: lastMsg.content + '\n\n[Antworte AUSSCHLIESSLICH als JSON-Objekt: {"question":"...","suggestions":["...","...",...]}]'
      }]
    : [...effectiveMessages, {
        role: 'user',
        content: '[Antworte AUSSCHLIESSLICH als JSON-Objekt: {"question":"...","suggestions":["...","...",...]}]'
      }]

  const response = await fetch(`${ONE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONE_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...jsonReminder],
      max_tokens: 700,
      temperature: 0.7
    })
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error: ${err}`)
  }
  const data = await response.json()
  let content = data.choices?.[0]?.message?.content?.trim() || ''
  content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  return content
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages = [], questionCount = 0 } = req.body

  if (questionCount >= 10) {
    return res.json({ done: true })
  }

  // Bis zu 3 Versuche bei leerem oder nicht-parsbarem Response
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const content = await callAI(messages)

      if (!content) {
        console.warn(`Attempt ${attempt}: empty content from AI`)
        continue
      }

      let parsed
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('no JSON object found')
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        const questionMatch = content.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"/)
        const question = questionMatch ? questionMatch[1] : null
        if (!question) {
          console.warn(`Attempt ${attempt}: could not extract question from: ${content.slice(0, 100)}`)
          continue
        }
        // Frage gefunden aber kein JSON — nochmal versuchen um Suggestions zu kriegen
        if (attempt < 3) {
          console.warn(`Attempt ${attempt}: got plain question, retrying for suggestions`)
          continue
        }
        return res.json({ question, suggestions: [], done: false })
      }

      if (parsed.done) {
        return res.json({ done: true })
      }

      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.filter(s =>
            typeof s === 'string' &&
            s.trim().length > 2 &&
            s !== '...' &&
            !s.toLowerCase().startsWith('etwas anderes')
          )
        : []

      // Suggestions leer — nochmal versuchen
      if (suggestions.length < 3 && attempt < 3) {
        console.warn(`Attempt ${attempt}: got ${suggestions.length} suggestions, retrying`)
        continue
      }

      return res.json({ question: parsed.question, suggestions, done: false })

    } catch (err) {
      console.error(`Attempt ${attempt} error:`, err.message?.slice(0, 150))
      if (attempt === 3) {
        return res.status(500).json({ error: 'Internal server error' })
      }
    }
  }

  return res.status(502).json({ error: 'Keine gültige Antwort nach 3 Versuchen' })
}
