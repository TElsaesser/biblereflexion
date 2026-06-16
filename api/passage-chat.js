const ONE_API_BASE = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY  = process.env.ONE_API_KEY || ''
const MODEL        = process.env.ONE_API_MODEL || 'gpt-4o'

function buildSystemPrompt(passage, summary, explanation) {
  return `Du bist ein einfühlsamer geistlicher Gesprächspartner.

Kontext — Lebenssituation der Person:
"${summary}"

Bibelstelle: ${passage.reference}${passage.title ? ` — ${passage.title}` : ''}
Bibeltext (Auszug): ${(passage.text || '').slice(0, 600)}
Persönliche Deutung: ${explanation}

Führe einen offenen, mehrstufigen Dialog zu dieser Bibelstelle.
Beantworte Fragen immer im Licht der beschriebenen Lebenssituation.
Gehe auf konkrete Verse oder Bilder aus dem Text ein wenn passend.
Bleibe warm, zugewandt und nicht belehrend.
Antworte in 4–8 Sätzen.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages = [], passage, summary = '', explanation = '' } = req.body
  if (!passage) return res.status(400).json({ error: 'Missing passage' })

  // SSE öffnen
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  try {
    const aiRes = await fetch(`${ONE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ONE_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          { role: 'system', content: buildSystemPrompt(passage, summary, explanation) },
          ...messages
        ],
        max_tokens: 600,
        temperature: 0.7
      })
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      console.error('passage-chat AI error:', err)
      res.write(`data: ${JSON.stringify({ error: 'AI error' })}\n\n`)
      res.end()
      return
    }

    // Tokens aus OpenAI-Stream direkt weiterleiten
    const reader  = aiRes.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const chunk = JSON.parse(payload)
          const token = chunk.choices?.[0]?.delta?.content
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`)
        } catch {}
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()

  } catch (err) {
    console.error('passage-chat error:', err.message)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: 'Fehler beim Laden' })}\n\n`)
      res.end()
    }
  }
}
