import http from 'http'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const env = readFileSync(join(__dir, '.env'), 'utf8')
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/)
      if (m) process.env[m[1]] = m[2].trim()
    }
  } catch {}
}

loadEnv()

async function runHandler(handlerPath, req, res) {
  const mod = await import(`${handlerPath}?t=${Date.now()}`)
  const handler = mod.default
  let body = ''
  req.on('data', d => (body += d))
  req.on('end', async () => {
    req.body = body ? JSON.parse(body) : {}
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(data))
    }
    res.status = (code) => { res.statusCode = code; return res }
    await handler(req, res)
  })
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.end(); return }

  if (req.url === '/api/chat') {
    return runHandler(join(__dir, 'api/chat.js'), req, res)
  }
  if (req.url === '/api/reflect') {
    return runHandler(join(__dir, 'api/reflect.js'), req, res)
  }
  if (req.url === '/api/enrich') {
    return runHandler(join(__dir, 'api/enrich.js'), req, res)
  }
  if (req.url === '/api/passage-chat') {
    return runHandler(join(__dir, 'api/passage-chat.js'), req, res)
  }
  if (req.url === '/api/info') {
    return runHandler(join(__dir, 'api/info.js'), req, res)
  }

  res.statusCode = 404
  res.end('Not found')
})

server.listen(3001, () => console.log('API dev server running on http://localhost:3001'))
