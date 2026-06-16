import http from 'http'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import process from 'process'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(join(__dirname, '.env'), 'utf8')
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim()
  }
} catch {}

const PORT = process.env.PORT || 3002

const server = http.createServer(async (req, res) => {
  if ((req.method !== 'POST' && req.method !== 'GET') || !req.url.startsWith('/api/')) {
    res.writeHead(404); res.end(); return
  }

  let body = Buffer.alloc(0)
  req.on('data', chunk => { body = Buffer.concat([body, chunk]) })
  req.on('end', async () => {
    try {
      req.body = JSON.parse(body.toString('utf8') || '{}')
    } catch { req.body = {} }

    // Attach Express-style helpers to native res
    res.status = (code) => { res.statusCode = code; return res }
    res.json = (data) => {
      if (!res.headersSent) {
        res.writeHead(res.statusCode || 200, { 'Content-Type': 'application/json' })
      }
      res.end(JSON.stringify(data))
      return res
    }

    try {
      const route = req.url.replace('/api/', '').split('?')[0]
      const mod = await import(`./api/${route}.js?t=${Date.now()}`)
      await mod.default(req, res)
    } catch (err) {
      console.error(err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
      }
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })
})

server.listen(PORT, () => console.log(`API server running on port ${PORT}`))
server.timeout = 0          // kein automatischer Socket-Timeout
server.keepAliveTimeout = 0
