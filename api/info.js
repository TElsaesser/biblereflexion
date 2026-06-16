import dns from 'dns/promises'

const ONE_API_BASE = process.env.ONE_API_BASE_URL || 'https://ai.ytels.de/v1'
const ONE_API_KEY  = process.env.ONE_API_KEY || ''
const MODEL        = process.env.ONE_API_MODEL || 'gpt-4o'

async function geoLookup(hostname) {
  try {
    const ips = await dns.resolve4(hostname)
    const ip = ips[0]
    const res = await fetch(`https://ipinfo.io/${ip}/json`, {
      signal: AbortSignal.timeout(4000)
    })
    if (!res.ok) return null
    const d = await res.json()
    return {
      ip,
      city:    d.city    || null,
      region:  d.region  || null,
      country: d.country || null,
      org:     d.org     || null,
    }
  } catch {
    return null
  }
}

function extractHostname(url) {
  try { return new URL(url).hostname } catch { return url }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const proxyHost    = extractHostname(ONE_API_BASE)
  const upstreamUrl  = process.env.ONE_API_UPSTREAM_URL || null
  const upstreamHost = upstreamUrl ? extractHostname(upstreamUrl) : null

  // Alle Lookups + Erreichbarkeitstest parallel
  const start = Date.now()
  const [proxyGeo, upstreamGeo, reachResult] = await Promise.allSettled([
    geoLookup(proxyHost),
    upstreamHost ? geoLookup(upstreamHost) : Promise.resolve(null),
    fetch(`${ONE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONE_API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1, temperature: 0 }),
      signal: AbortSignal.timeout(10000)
    })
  ])

  const reachable  = reachResult.status === 'fulfilled' && reachResult.value.ok
  const latencyMs  = Date.now() - start

  function formatGeo(geo) {
    if (!geo) return null
    const parts = [geo.city, geo.region, geo.country].filter(Boolean)
    return { ip: geo.ip, location: parts.join(', '), org: geo.org }
  }

  return res.json({
    configured_model:    MODEL,
    configured_provider: ONE_API_BASE,
    proxy_geo:           formatGeo(proxyGeo.value),
    upstream_url:        upstreamUrl,
    upstream_model:      process.env.ONE_API_UPSTREAM_MODEL || null,
    upstream_geo:        formatGeo(upstreamGeo.value),
    reachable,
    latency_ms:          latencyMs,
  })
}
