const BIBLE_BASE = '/ELB2006-RoundtripHTML'

export async function fetchVerses(testament, book, chapter, startVerse, endVerse) {
  const url = `${BIBLE_BASE}/${testament}/${book}_${chapter}.html`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bibelstelle nicht gefunden: ${url}`)
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const results = []
  let currentHeading = null

  for (let v = startVerse; v <= endVerse; v++) {
    const div = doc.querySelector(`#v${v}`)
    if (!div) continue

    const h3 = div.querySelector('h3')
    if (h3) currentHeading = h3.textContent.trim()

    const clone = div.cloneNode(true)
    clone.querySelectorAll('sup.fnm').forEach(el => el.remove())
    clone.querySelectorAll('h3').forEach(el => el.remove())
    clone.querySelectorAll('.br-p').forEach(el => el.remove())
    const span = clone.querySelector('.vn')
    if (span) span.remove()

    const text = clone.textContent.trim()
    if (!text) continue

    results.push({ verse: v, text, heading: currentHeading })
    currentHeading = null
  }

  return results
}

export function renderVerses(verses) {
  let html = ''
  for (const v of verses) {
    if (v.heading) {
      html += `<h3>${v.heading}</h3>`
    }
    html += `<p class="bible-verse"><span class="bible-verse-num">${v.verse}</span>${v.text}</p>`
  }
  return html
}
