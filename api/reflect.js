const ONE_API_BASE = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY = process.env.ONE_API_KEY || ''
const MODEL = process.env.ONE_API_MODEL || 'gpt-4o'

const SYSTEM_PROMPT = `Du erhältst ein Reflexionsgespräch zwischen einem Menschen und einem geistlichen Begleiter. Deine Aufgabe:

1. Fasse die aktuelle Lebenssituation der Person in 3-4 ruhigen, einfühlsamen Sätzen zusammen.

2. Wähle genau 3 Bibelstellen aus der Elberfelder Bibel 2006, die zu dieser Situation passen.
   - Wähle zusammenhängende Abschnitte von mindestens 15–20 Versen für ausreichend Kontext und Tiefe
   - Bevorzuge Abschnitte, die einen vollständigen Gedankengang enthalten (z.B. einen ganzen Psalm, eine vollständige Perikope, einen ganzen Briefabschnitt)
   - Nutze diese exakten deutschen Buchabkürzungen (Dateinamen-Konvention):
     AT: 1.Mose, 2.Mose, 3.Mose, 4.Mose, 5.Mose, Jos, Ri, Rut, 1.Sam, 2.Sam, 1.Kön, 2.Kön, 1.Chr, 2.Chr, Esra, Neh, Est, Hiob, Ps, Spr, Pred, Hld, Jes, Jer, Klgl, Hes, Dan, Hos, Joel, Am, Obd, Jona, Mi, Nah, Hab, Zef, Hag, Sach, Mal
     NT: Mt, Mk, Lk, Joh, Apg, Röm, 1.Kor, 2.Kor, Gal, Eph, Phil, Kol, 1.Thess, 2.Thess, 1.Tim, 2.Tim, Tit, Phlm, Hebr, Jak, 1.Petr, 2.Petr, 1.Joh, 2.Joh, 3.Joh, Jud, Offb

3. Schreibe für jede Stelle eine persönliche Deutung (10–14 Sätze): Was sagt dieser Text der Person konkret in ihrer Situation? Gehe ausführlich auf einzelne Verse, Bilder und Motive aus dem Text ein. Zeige, wie der Text die Situation der Person berührt, tröstet, herausfordert oder Orientierung gibt. Verbinde den Text mit konkreten Elementen aus dem Gespräch. Schreibe warm, zugewandt und meditativ – nicht belehrend, sondern einladend.

Antworte AUSSCHLIESSLICH als valides JSON ohne Markdown-Codeblocks:
{
  "summary": "...",
  "passages": [
    {
      "title": "Kurze, treffende Überschrift (4–7 Wörter, die den Kern dieser Stelle für diese Person benennt)",
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

Testament-Werte: "ot" für Altes Testament, "nt" für Neues Testament.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages = [] } = req.body

  // SSE-Stream: schickt sofort Daten, verhindert Cloudflare-Timeout
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  // Heartbeat alle 15s damit Cloudflare die Verbindung offen hält
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n')
  }, 15000)

  try {
    const response = await fetch(`${ONE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ONE_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
          { role: 'user', content: 'Bitte erstelle jetzt die Auswertung mit Zusammenfassung und 3 Bibelstellen als JSON.' }
        ],
        max_tokens: 2500,
        temperature: 0.6
      })
    })

    clearInterval(heartbeat)

    if (!response.ok) {
      const err = await response.text()
      console.error('AI API error:', err)
      res.write(`data: ${JSON.stringify({ error: 'AI API error' })}\n\n`)
      res.end()
      return
    }

    const data = await response.json()
    let content = data.choices?.[0]?.message?.content?.trim() || ''
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')

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

    res.write(`data: ${JSON.stringify(parsed)}\n\n`)
    res.end()
  } catch (err) {
    clearInterval(heartbeat)
    console.error('Handler error:', err)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`)
      res.end()
    }
  }
}
