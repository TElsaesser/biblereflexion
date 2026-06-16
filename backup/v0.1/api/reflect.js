const ONE_API_BASE    = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY     = process.env.ONE_API_KEY || ''
const MODEL           = process.env.ONE_API_MODEL || 'gpt-4o'
const BIBLE_SEARCH    = process.env.BIBLE_SEARCH_URL || 'http://localhost:3003'

const SYSTEM_PROMPT_RAG = `Du erhältst ein Reflexionsgespräch und eine vorselektierte Liste von Bibelabschnitten.

Deine Aufgabe:
1. Fasse die Lebenssituation in 3-4 ruhigen, einfühlsamen Sätzen zusammen.
2. Wähle genau 3 Bibelstellen aus der bereitgestellten Liste aus.
   - Bevorzuge semantische Passung und Vielfalt (verschiedene Bücher, Formen)
   - Bevorzuge weniger bekannte Texte wenn sie gut passen
   - Wähle Abschnitte die den Menschen wirklich überraschen könnten
3. Schreibe für jede Stelle eine persönliche Deutung (10–14 Sätze).
   Gehe auf einzelne Verse, Bilder und Motive ein. Verbinde mit konkreten Elementen aus dem Gespräch.
   Schreibe warm, zugewandt und meditativ.

Antworte AUSSCHLIESSLICH als valides JSON ohne Markdown:
{
  "summary": "...",
  "passages": [
    {
      "title": "Kurze treffende Überschrift (4–7 Wörter)",
      "reference": "Ps 23:1-6",
      "book": "Ps",
      "chapter": 23,
      "startVerse": 1,
      "endVerse": 6,
      "testament": "ot",
      "explanation": "..."
    }
  ]
}
Testament: "ot" = Altes Testament, "nt" = Neues Testament.`

const SYSTEM_PROMPT_FALLBACK = `Du erhältst ein Reflexionsgespräch zwischen einem Menschen und einem geistlichen Begleiter. Deine Aufgabe:

1. Fasse die aktuelle Lebenssituation der Person in 3-4 ruhigen, einfühlsamen Sätzen zusammen.

2. Wähle genau 3 Bibelstellen aus der Elberfelder Bibel 2006, die zu dieser Situation passen.
   - Wähle zusammenhängende Abschnitte von mindestens 15–20 Versen für ausreichend Kontext und Tiefe
   - Bevorzuge weniger bekannte Stellen die wirklich zur Situation passen
   - Nutze diese exakten deutschen Buchabkürzungen:
     AT: 1.Mose, 2.Mose, 3.Mose, 4.Mose, 5.Mose, Jos, Ri, Rut, 1.Sam, 2.Sam, 1.Kön, 2.Kön, 1.Chr, 2.Chr, Esra, Neh, Est, Hiob, Ps, Spr, Pred, Hld, Jes, Jer, Klgl, Hes, Dan, Hos, Joel, Am, Obd, Jona, Mi, Nah, Hab, Zef, Hag, Sach, Mal
     NT: Mt, Mk, Lk, Joh, Apg, Röm, 1.Kor, 2.Kor, Gal, Eph, Phil, Kol, 1.Thess, 2.Thess, 1.Tim, 2.Tim, Tit, Phlm, Hebr, Jak, 1.Petr, 2.Petr, 1.Joh, 2.Joh, 3.Joh, Jud, Offb

3. Schreibe für jede Stelle eine persönliche Deutung (10–14 Sätze).
   Gehe auf einzelne Verse, Bilder und Motive ein. Verbinde mit konkreten Elementen aus dem Gespräch.
   Schreibe warm, zugewandt und meditativ.

Antworte AUSSCHLIESSLICH als valides JSON ohne Markdown:
{
  "summary": "...",
  "passages": [
    {
      "title": "Kurze treffende Überschrift (4–7 Wörter)",
      "reference": "Ps 23:1-6",
      "book": "Ps",
      "chapter": 23,
      "startVerse": 1,
      "endVerse": 6,
      "testament": "ot",
      "explanation": "..."
    }
  ]
}
Testament: "ot" = Altes Testament, "nt" = Neues Testament.`

async function searchBibleCandidates(query, emotions) {
  try {
    const res = await fetch(`${BIBLE_SEARCH}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, emotions, n: 25, diversity: 0.35 }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function extractQueryInfo(messages) {
  // Extrahiere Gesprächsinhalt für die Vektorsuche
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ')
  return userMessages.slice(0, 600)
}

function formatCandidatesForLLM(candidates) {
  return candidates.slice(0, 25).map((c, i) =>
    `[${i+1}] ${c.reference} – ${c.heading || c.summary || ''}
${c.text.slice(0, 200)}…`
  ).join('\n\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages = [] } = req.body

  // SSE-Stream öffnen
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  try {
    // Versuche RAG-Suche
    const query = extractQueryInfo(messages)
    const candidates = await searchBibleCandidates(query, [])
    const useRAG = candidates && candidates.length >= 5

    let systemPrompt, userContent
    if (useRAG) {
      console.log(`RAG: ${candidates.length} Kandidaten gefunden`)
      systemPrompt = SYSTEM_PROMPT_RAG
      userContent = `Reflexionsgespräch:\n${messages.map(m => `${m.role === 'assistant' ? 'Assistent' : 'Person'}: ${m.content}`).join('\n')}\n\n---\nVorselektierte Bibelabschnitte:\n\n${formatCandidatesForLLM(candidates)}`
    } else {
      console.log('RAG nicht verfügbar, nutze direkten Prompt')
      systemPrompt = SYSTEM_PROMPT_FALLBACK
      userContent = 'Bitte erstelle jetzt die Auswertung mit Zusammenfassung und 3 Bibelstellen als JSON.'
    }

    const aiRes = await fetch(`${ONE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
          { role: 'user', content: userContent }
        ],
        max_tokens: 2500,
        temperature: 0.6
      })
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      console.error('AI API error:', err)
      res.write(`data: ${JSON.stringify({ error: 'AI API error' })}\n\n`)
      res.end()
      return
    }

    // Stream akkumulieren
    const reader = aiRes.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const chunk = JSON.parse(payload)
          accumulated += chunk.choices?.[0]?.delta?.content || ''
        } catch {}
      }
    }

    const content = accumulated.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON in reflect response:', content.slice(0, 200))
      res.write(`data: ${JSON.stringify({ error: 'Ungültiges Antwortformat' })}\n\n`)
      res.end()
      return
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.summary || !Array.isArray(parsed.passages) || parsed.passages.length !== 3) {
      res.write(`data: ${JSON.stringify({ error: 'Ungültiges Antwortformat' })}\n\n`)
      res.end()
      return
    }

    // Bei RAG: Verse-Grenzen aus Kandidaten übernehmen wenn LLM-Referenz passt
    if (useRAG) {
      for (const passage of parsed.passages) {
        const match = candidates.find(c =>
          c.book === passage.book && c.chapter === passage.chapter
        )
        if (match) {
          passage.startVerse = match.start_verse
          passage.endVerse   = match.end_verse
        }
      }
    }

    res.write(`data: ${JSON.stringify(parsed)}\n\n`)
    res.end()

  } catch (err) {
    console.error('Handler error:', err)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`)
      res.end()
    }
  }
}
