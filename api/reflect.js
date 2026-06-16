const ONE_API_BASE  = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY   = process.env.ONE_API_KEY || ''
const MODEL         = process.env.ONE_API_MODEL || 'gpt-4o'
const BIBLE_SEARCH  = process.env.BIBLE_SEARCH_URL || 'http://localhost:3003'

// ── Prompts ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT_RAG = `Du erhältst ein Reflexionsgespräch und eine vorselektierte Liste von Bibelabschnitten aus der Elberfelder Bibel 2006.

Deine Aufgabe:
1. Fasse die Lebenssituation in 3-4 ruhigen, einfühlsamen Sätzen zusammen.
2. Wähle genau 3 Bibelabschnitte aus der bereitgestellten Liste.
   - Bevorzuge semantische Passung zur konkreten Situation
   - Wähle verschiedene Bücher und literarische Formen
   - Bevorzuge weniger bekannte Texte wenn sie gut passen
   - Mindestens 1 aus dem Alten Testament und 1 aus dem Neuen Testament
3. Schreibe für jede Stelle eine persönliche Deutung (10-14 Sätze).
   Gehe auf einzelne Verse, Bilder und Motive ein.
   Verbinde konkret mit Elementen aus dem Gespräch.
   Schreibe warm, zugewandt und meditativ – nicht belehrend.

WICHTIG: Verwende AUSSCHLIESSLICH Stellen aus der bereitgestellten Liste [1]–[25]. Erfinde keine eigenen Referenzen. Wenn du eine Stelle wählst, übernimm die Referenz exakt so wie sie in der Liste steht (z.B. "Hiob 7,1–21" nicht "Hiob 7:1-21").

Antworte AUSSCHLIESSLICH als valides JSON ohne Markdown:
{
  "summary": "...",
  "rag_used": true,
  "passages": [
    {
      "title": "Kurze Überschrift (4-7 Wörter)",
      "reference": "exakt wie in der Liste angegeben",
      "book": "Buchabkürzung",
      "chapter": 23,
      "startVerse": 1,
      "endVerse": 6,
      "testament": "ot",
      "explanation": "..."
    }
  ]
}`

const SYSTEM_PROMPT_FALLBACK = `Du erhältst ein Reflexionsgespräch zwischen einem Menschen und einem geistlichen Begleiter.

Deine Aufgabe:
1. Fasse die Lebenssituation in 3-4 ruhigen, einfühlsamen Sätzen zusammen.
2. Wähle genau 3 Bibelstellen aus der Elberfelder Bibel 2006.
   - Abschnitte von mindestens 15-20 Versen
   - Bevorzuge weniger bekannte Stellen die wirklich zur Situation passen
   - Mindestens 1 AT + 1 NT
   - Nutze exakte Buchabkürzungen:
     AT: 1.Mose, 2.Mose, 3.Mose, 4.Mose, 5.Mose, Jos, Ri, Rut, 1.Sam, 2.Sam, 1.Kön, 2.Kön, 1.Chr, 2.Chr, Esra, Neh, Est, Hiob, Ps, Spr, Pred, Hld, Jes, Jer, Klgl, Hes, Dan, Hos, Joel, Am, Obd, Jona, Mi, Nah, Hab, Zef, Hag, Sach, Mal
     NT: Mt, Mk, Lk, Joh, Apg, Röm, 1.Kor, 2.Kor, Gal, Eph, Phil, Kol, 1.Thess, 2.Thess, 1.Tim, 2.Tim, Tit, Phlm, Hebr, Jak, 1.Petr, 2.Petr, 1.Joh, 2.Joh, 3.Joh, Jud, Offb
3. Schreibe für jede Stelle eine persönliche Deutung (10-14 Sätze).
   Gehe auf einzelne Verse, Bilder und Motive ein.
   Verbinde konkret mit Elementen aus dem Gespräch.
   Schreibe warm, zugewandt und meditativ.

Antworte AUSSCHLIESSLICH als valides JSON ohne Markdown:
{
  "summary": "...",
  "rag_used": false,
  "passages": [
    {
      "title": "Kurze Überschrift (4-7 Wörter)",
      "reference": "Ps 23:1-6",
      "book": "Ps",
      "chapter": 23,
      "startVerse": 1,
      "endVerse": 6,
      "testament": "ot",
      "explanation": "..."
    }
  ]
}`

// ── RAG-Suche ─────────────────────────────────────────────────────────

function buildSearchQuery(messages) {
  return messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ')
    .slice(0, 800)
}

async function searchCandidates(query) {
  try {
    const res = await fetch(`${BIBLE_SEARCH}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n: 25, diversity: 0.35 }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const candidates = await res.json()
    return candidates.length >= 5 ? candidates : null
  } catch (err) {
    console.log('RAG-Suche nicht verfügbar:', err.message)
    return null
  }
}

function formatCandidatesForLLM(candidates) {
  const ot = candidates.filter(c => c.testament === 'ot')
  const nt = candidates.filter(c => c.testament === 'nt')
  const all = [...ot, ...nt]

  return all.map((c, i) => {
    const lines = [
      `[${i+1}] ${c.reference} – ${c.heading || ''}`,
    ]

    if (c.summary) lines.push(`Inhalt: ${c.summary}`)

    const tagParts = []
    if (c.literary_form)                     tagParts.push(`Form: ${c.literary_form}`)
    if (c.intensity)                          tagParts.push(`Intensität: ${c.intensity}`)
    if (c.emotions?.length)                   tagParts.push(`Emotionen: ${c.emotions.join(', ')}`)
    if (c.situations?.length)                 tagParts.push(`Situationen: ${c.situations.join(', ')}`)
    if (c.actions?.length)                    tagParts.push(`Handlungen: ${c.actions.join(', ')}`)
    if (c.spiritual?.length)                  tagParts.push(`Spirituell: ${c.spiritual.join(', ')}`)
    if (tagParts.length) lines.push(tagParts.join(' | '))

    lines.push(`Text: ${c.text.slice(0, 400)}…`)

    return lines.join('\n')
  }).join('\n\n')
}

// ── Stream-Akkumulator ────────────────────────────────────────────────

async function streamToString(aiRes) {
  const reader  = aiRes.body.getReader()
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
  return accumulated
}

function parseJSON(content) {
  const clean = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  const m = clean.match(/\{[\s\S]*\}/)
  if (!m) return null
  return JSON.parse(m[0])
}

// ── Handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages = [] } = req.body

  // SSE öffnen
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  try {
    // RAG-Suche parallel starten
    const query      = buildSearchQuery(messages)
    const candidates = await searchCandidates(query)
    const useRAG     = candidates && candidates.length >= 5

    let systemPrompt, userContent
    if (useRAG) {
      console.log(`RAG: ${candidates.length} Kandidaten (${candidates.filter(c=>c.testament==='ot').length} AT, ${candidates.filter(c=>c.testament==='nt').length} NT)`)
      systemPrompt = SYSTEM_PROMPT_RAG
      userContent  = [
        'Reflexionsgespräch:',
        messages.map(m => `${m.role === 'assistant' ? 'Begleiter' : 'Person'}: ${m.content}`).join('\n'),
        '',
        '---',
        'Vorselektierte Bibelabschnitte (wähle 3 davon aus):',
        '',
        formatCandidatesForLLM(candidates),
      ].join('\n')
    } else {
      console.log('RAG nicht verfügbar – direkter Prompt-Modus')
      systemPrompt = SYSTEM_PROMPT_FALLBACK
      userContent  = 'Bitte erstelle jetzt die Auswertung mit Zusammenfassung und 3 Bibelstellen als JSON.'
    }

    // LLM-Call mit Streaming
    const aiRes = await fetch(`${ONE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
          { role: 'user',   content: userContent },
        ],
        max_tokens: 2500,
        temperature: 0.6,
      })
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      console.error('AI API error:', err)
      res.write(`data: ${JSON.stringify({ error: 'AI API error' })}\n\n`)
      res.end()
      return
    }

    const accumulated = await streamToString(aiRes)
    let parsed

    try {
      parsed = parseJSON(accumulated)
    } catch (e) {
      console.error('JSON parse error:', accumulated.slice(0, 200))
      res.write(`data: ${JSON.stringify({ error: 'Ungültiges Antwortformat' })}\n\n`)
      res.end()
      return
    }

    if (!parsed?.summary || !Array.isArray(parsed.passages) || parsed.passages.length !== 3) {
      console.error('Invalid structure:', JSON.stringify(parsed).slice(0, 200))
      res.write(`data: ${JSON.stringify({ error: 'Ungültiges Antwortformat' })}\n\n`)
      res.end()
      return
    }

    // Bei RAG: validieren dass LLM nur Kandidaten gewählt hat
    // Falls halluziniert → durch besten ungenutzten Kandidaten ersetzen
    if (useRAG) {
      const usedCandidateIds = new Set()

      for (let i = 0; i < parsed.passages.length; i++) {
        const passage = parsed.passages[i]
        const match = candidates.find(c =>
          c.book === passage.book && c.chapter === passage.chapter
        )

        if (match) {
          // Korrekt — Vers-Grenzen aus Kandidaten übernehmen
          passage.startVerse = match.start_verse
          passage.endVerse   = match.end_verse
          passage.testament  = match.testament
          usedCandidateIds.add(match.id)
        } else {
          // Halluziniert — ersetze durch besten ungenutzten Kandidaten
          const fallback = candidates.find(c => !usedCandidateIds.has(c.id))
          if (fallback) {
            console.warn(`Halluzination ersetzt: "${passage.reference}" → "${fallback.reference}"`)
            parsed.passages[i] = {
              ...passage,
              reference:  fallback.reference,
              book:       fallback.book,
              chapter:    fallback.chapter,
              startVerse: fallback.start_verse,
              endVerse:   fallback.end_verse,
              testament:  fallback.testament,
              title:      passage.title || fallback.heading,
            }
            usedCandidateIds.add(fallback.id)
          }
        }
      }
    }

    console.log(`Reflect fertig: RAG=${useRAG}, Stellen: ${parsed.passages.map(p=>p.reference).join(', ')}`)
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
