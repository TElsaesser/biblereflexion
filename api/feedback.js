import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const FEEDBACK_FILE = join(__dirname, '../data/feedback.json')

function readFeedback() {
  try { return JSON.parse(readFileSync(FEEDBACK_FILE, 'utf8')) } catch { return {} }
}

function writeFeedback(data) {
  writeFileSync(FEEDBACK_FILE, JSON.stringify(data, null, 2), 'utf8')
}

export function getFeedbackScores() {
  return readFeedback()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { section_id, type } = req.body
  // type: 'too_common' | 'good' | 'great' | 'favorite'
  if (!section_id || !type) return res.status(400).json({ error: 'Missing fields' })

  const data = readFeedback()
  if (!data[section_id]) data[section_id] = { too_common: 0, good: 0, great: 0, favorite: 0 }
  if (data[section_id][type] !== undefined) data[section_id][type]++
  writeFeedback(data)

  return res.json({ ok: true, scores: data[section_id] })
}
