const ONE_API_BASE = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY  = process.env.ONE_API_KEY || ''
const MODEL        = process.env.ONE_API_MODEL || 'gpt-4o'

const PROMPTS = {
  reasoning: (passage, summary) => `
Du bist ein geistlicher Begleiter. Eine Person befindet sich in folgender Lebenssituation:
"${summary}"

Bibelstelle: ${passage.reference} – ${passage.title || ''}
Bibeltext (Auszug): ${passage.text?.slice(0, 600) || ''}

Erkläre in 4–6 Sätzen KONKRET und PERSÖNLICH, warum genau diese Bibelstelle zur Situation dieser Person passt.
Zeige die direkte Verbindung zwischen der Lebenssituation und dem Bibeltext.
Schreibe warm und einladend, nicht theologisch-abstrakt.
Antworte NUR mit dem Erklärungstext, ohne Überschrift.`.trim(),

  history: (passage) => `
Du bist ein Bibel-Historiker und Theologe. Beschreibe die Bibelstelle ${passage.reference} in drei klar getrennten Abschnitten.

Antworte AUSSCHLIESSLICH als JSON:
{
  "historical": "Was ist über die historische Entstehung, den Autor, die Zeitepoche und den ursprünglichen Kontext gesichert? (3-4 Sätze)",
  "interpretations": "Welche wichtigen theologischen Interpretationen und Auslegungstraditionen gibt es zu dieser Stelle? Wo gibt es Deutungsunterschiede? (3-4 Sätze)",
  "relevance": "Welche Bedeutung hat dieser Text für Menschen heute? Welche Themen sind zeitlos aktuell? (2-3 Sätze)"
}`.trim(),
}

async function callLLM(prompt, stream = false) {
  const res = await fetch(`${ONE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONE_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      stream,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.6
    })
  })
  if (!res.ok) throw new Error(`AI error: ${res.status}`)
  return res
}

async function streamToString(res) {
  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let out = '', buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const p = line.slice(6).trim()
      if (p === '[DONE]') continue
      try { out += JSON.parse(p).choices?.[0]?.delta?.content || '' } catch {}
    }
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type, passage, summary } = req.body
  if (!type || !passage) return res.status(400).json({ error: 'Missing type or passage' })

  // SSE-Stream öffnen
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  try {
    if (type === 'reasoning') {
      const aiRes = await callLLM(PROMPTS.reasoning(passage, summary || ''), true)
      const text  = await streamToString(aiRes)
      res.write(`data: ${JSON.stringify({ type: 'reasoning', text })}\n\n`)

    } else if (type === 'history') {
      const aiRes  = await callLLM(PROMPTS.history(passage), true)
      const raw    = await streamToString(aiRes)
      const clean  = raw.replace(/^```json\s*/i,'').replace(/```\s*$/i,'').trim()
      const m      = clean.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : { historical: raw, interpretations: '', relevance: '' }
      res.write(`data: ${JSON.stringify({ type: 'history', ...parsed })}\n\n`)

    } else {
      res.write(`data: ${JSON.stringify({ error: 'Unknown type' })}\n\n`)
    }
  } catch (err) {
    console.error('enrich error:', err.message)
    res.write(`data: ${JSON.stringify({ error: 'Fehler beim Laden' })}\n\n`)
  }

  res.end()
}
