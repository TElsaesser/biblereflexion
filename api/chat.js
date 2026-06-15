const ONE_API_BASE = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY = process.env.ONE_API_KEY || ''
const MODEL = process.env.ONE_API_MODEL || 'gpt-4o'

const SYSTEM_PROMPT = `Du bist ein ruhiger, geistlicher Reflexionsassistent.
Du führst einen Menschen durch maximal 10 adaptive Fragen zu seiner aktuellen Lebenssituation.

REGELN:
- Stelle immer nur 1 Frage gleichzeitig
- Passe jede Frage an die vorherigen Antworten an
- Bleibe ruhig, nicht therapeutisch, nicht wertend

PFLICHT-ANTWORTFORMAT – IMMER exakt so, kein Markdown, keine Erklärungen davor oder danach:
{"question":"<deine Frage>","suggestions":["<Vorschlag 1>","<Vorschlag 2>","<Vorschlag 3>","<Vorschlag 4>","<Vorschlag 5>","<Vorschlag 6>","<Vorschlag 7>","<Vorschlag 8>","<Vorschlag 9>","<Vorschlag 10>","Etwas anderes…"]}

Die suggestions sind 10–14 kurze Antwortvorschläge (2–6 Wörter), die typische Antworten auf genau DIESE Frage abdecken. Der letzte Eintrag ist IMMER "Etwas anderes…".

Gesprächsende (nach mindestens 5 Fragen, wenn genug Kontext da ist):
{"done":true}`

async function callAI(messages) {
  const response = await fetch(`${ONE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONE_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
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

async function generateSuggestionsForQuestion(question) {
  const prompt = `Frage: "${question}"
Gib genau 10 kurze Antwortvorschläge (2–6 Wörter) auf diese Frage aus.
Antworte NUR als JSON-Array: ["...", "...", ..., "Etwas anderes…"]`

  const response = await fetch(`${ONE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONE_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.6
    })
  })
  if (!response.ok) return []
  const data = await response.json()
  let content = data.choices?.[0]?.message?.content?.trim() || ''
  content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const arr = JSON.parse(content)
    if (Array.isArray(arr)) return arr
  } catch {}
  return []
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages = [], questionCount = 0 } = req.body

  if (questionCount >= 10) {
    return res.json({ done: true })
  }

  try {
    const content = await callAI(messages)

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      // Modell gab Plaintext — als Frage verwenden, Suggestions separat holen
      console.warn('Non-JSON, fetching suggestions separately for:', content.slice(0, 80))
      const suggestions = await generateSuggestionsForQuestion(content)
      return res.json({ question: content, suggestions, done: false })
    }

    if (parsed.done) {
      return res.json({ done: true })
    }

    // Suggestions fehlen oder leer → separat nachholen
    let suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    if (suggestions.length < 3) {
      console.warn('Suggestions missing, fetching separately')
      suggestions = await generateSuggestionsForQuestion(parsed.question)
    }

    return res.json({ question: parsed.question, suggestions, done: false })
  } catch (err) {
    console.error('Handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
