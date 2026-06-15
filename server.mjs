import http from 'http'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import process from 'process'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Lade .env
try {
  const env = readFileSync(join(__dirname, '.env'), 'utf8')
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim()
  }
} catch {}

const PORT = process.env.PORT || 3001

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/api/')) {
    res.writeHead(404); res.end(); return
  }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    try {
      req.body = JSON.parse(body || '{}')
    } catch { req.body = {} }

    const mockRes = {
      _status: 200, _body: null,
      status(code) { this._status = code; return this },
      json(data) { this._body = data; return this }
    }

    try {
      const route = req.url.replace('/api/', '')
      const mod = await import(`./api/${route}.js?t=${Date.now()}`)
      await mod.default(req, mockRes)
    } catch (err) {
      console.error(err)
      mockRes._status = 500
      mockRes._body = { error: 'Internal server error' }
    }

    res.writeHead(mockRes._status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(mockRes._body))
  })
})

server.listen(PORT, () => console.log(`API server running on port ${PORT}`))
