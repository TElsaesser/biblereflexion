import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATS_FILE = join(__dirname, '../data/stats.json')

function readStats() {
  try {
    return JSON.parse(readFileSync(STATS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeStats(data) {
  writeFileSync(STATS_FILE, JSON.stringify(data, null, 2), 'utf8')
}

function today() {
  return new Date().toISOString().slice(0, 10)  // "2026-06-16"
}

export function incrementStats() {
  const stats = readStats()
  const key   = today()
  stats[key]  = (stats[key] || 0) + 1
  writeStats(stats)
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    incrementStats()
    return res.json({ ok: true })
  }

  if (req.method === 'GET') {
    const stats   = readStats()
    const todayKey = today()
    const todayCount = stats[todayKey] || 0

    // Alle Tage sortiert absteigend
    const history = Object.entries(stats)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, count]) => ({ date, count }))

    return res.json({ today: todayCount, history })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
