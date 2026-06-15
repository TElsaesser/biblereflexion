# Bibel & Reflexion mit KI-Unterstützung — Implementation Plan

## Context

Workshop-Tool für eine Veranstaltung zum Thema "Bibel & Reflexion mit KI". Teilnehmer scannen einen QR-Code, führen ein geistliches Reflexionsgespräch mit bis zu 10 adaptiven KI-Fragen, erhalten eine Zusammenfassung ihrer Lebenssituation und drei passende Bibelstellen (Elberfelder Bibel 2006) mit persönlicher Deutung. Die Bibeldaten liegen bereits lokal vor (`ELB2006-RoundtripHTML/`). API-Endpoint: `https://ai.ytels.de/v1` (OpenAI-kompatibel).

---

## Architektur

**Tech Stack**: Vite (Vanilla JS, kein Framework) + Vercel Serverless Functions  
**Deployment**: Vercel (statisches Frontend + API Routes)  
**Bible-Daten**: Statisch served aus `ELB2006-RoundtripHTML/`, client-seitig per `fetch` + `DOMParser` geparst  
**Logging**: Client-seitig in `localStorage` + Download-Button am Ende (kein Server-Storage nötig)

```
biblereflexion/
├── index.html                    # App-Shell (eine HTML-Datei)
├── src/
│   ├── main.js                   # Phasen-Router, App-Init
│   ├── phases/
│   │   ├── consent.js            # Phase A: Datenschutz-Wahl + Start
│   │   ├── chat.js               # Phase B: Adaptiver Fragen-Flow
│   │   ├── summary.js            # Phase C: Auswertung anzeigen
│   │   └── bible.js              # Phase D: Bibelstellen + Deutung
│   ├── bible-parser.js           # HTML fetch + DOM-Parsing, BOOK_MAP
│   ├── logger.js                 # localStorage-Logging + JSON-Export
│   └── style.css                 # Mobile-first, ruhiges geistliches Design
├── api/
│   ├── chat.js                   # Serverless: nächste adaptive Frage
│   └── reflect.js                # Serverless: Summary + 3 Bibelstellen + Deutung
├── ELB2006-RoundtripHTML/        # Vorhandene Bibel-HTMLs (unverändert)
├── vercel.json                   # Routing: /api/* → functions, /* → static
├── package.json                  # Vite + dotenv
└── .env                          # ONE_API_KEY, ONE_API_BASE_URL (nicht committed)
```

---

## Phasen im Detail

### Phase A — Consent & Start (`consent.js`)
- Zeigt Titel + kurze Erklärung des Tools
- Datenschutz-Wahl: **"Ohne Speicherung"** / **"Vollständiges Logging (lokal)"**
- Bei Logging: Hinweis, dass alle Antworten am Ende als JSON heruntergeladen werden können
- "Starten"-Button → löst Phase B aus
- Logger-Präferenz wird in `localStorage` gespeichert

### Phase B — Adaptiver Chat-Flow (`chat.js`)
- Chat-Bubble-UI (Fragen linksbündig, Antworten rechtsbündig)
- Fortschrittsanzeige: "Frage 3 von max. 10"
- Bei jeder Eingabe: POST an `/api/chat` mit vollem `messages`-Array + `questionCount`
- API gibt `{ "question": "...", "done": false }` zurück, oder `{ "done": true }` wenn KI fertig
- Weiter → Phase C

### Phase C — Auswertung (`summary.js`)
- POST an `/api/reflect` mit vollem `messages`-Array
- Zeigt Lade-Animation ("Deine Reflexion wird zusammengestellt…")
- Zeigt die KI-Zusammenfassung der Lebenssituation (2-3 Sätze)
- Zeigt drei Karten mit: Bibelstelle-Referenz + Deutungstext
- Parallel: Für jede Referenz → `bible-parser.js` fetcht und extrahiert Verse
- Weiter → Phase D (oder Verse werden direkt in Phase C inline gezeigt)

### Phase D — Bibelmodul (`bible.js`)
- Für jede der 3 Stellen: Karte mit vollem Bibeltext (mind. 5 Verse) + KI-Deutung
- Bibeltext aus lokalem HTML extrahiert (Fußnoten-Superscripts werden entfernt)
- "Diese Reflexion speichern" → exportiert JSON via `logger.js`
- QR-Code für die Seite anzeigen (generiert via `qrcode`-npm-Paket)

---

## API Routes

### `POST /api/chat`
**Input**: `{ messages: [{role, content}], questionCount: number }`  
**Output**: `{ question: string, done: boolean }`

System-Prompt:
```
Du bist ein ruhiger, strukturierter geistlicher Reflexionsassistent.
Stelle immer nur 1 Frage gleichzeitig. Maximal 10 Fragen insgesamt.
Passe jede Frage an die vorherige Antwort an.
Bleibe ruhig, nicht therapeutisch, nicht wertend.
Erkenne zentrale Themen: Stress, Angst, Orientierung, Beziehungen, Glaube, Erschöpfung.

Antworte NUR mit der nächsten Frage (kein Einleiten, keine Kommentare davor oder danach).
Wenn du nach mindestens 5 Fragen genug Informationen gesammelt hast, antworte ausschließlich mit: {"done":true}
Beginne mit einer offenen Einstiegsfrage wie: "Was beschäftigt dich gerade am meisten in deinem Leben?"
```

### `POST /api/reflect`
**Input**: `{ messages: [{role, content}] }`  
**Output**:
```json
{
  "summary": "...",
  "passages": [
    {
      "reference": "Ps 23:1-6",
      "path": "ot/Ps_23.html",
      "startVerse": 1,
      "endVerse": 6,
      "explanation": "..."
    }
  ]
}
```

System-Prompt:
```
Du erhältst ein Reflexionsgespräch. Deine Aufgabe:

1. Fasse die Lebenssituation in 2-3 ruhigen, nicht-wertenden Sätzen zusammen.

2. Wähle genau 3 Bibelstellen aus der Elberfelder Bibel 2006, die zur Situation passen.
   - Wähle zusammenhängende Abschnitte von mindestens 5 Versen für ausreichend Kontext
   - Verwende die deutschen Buchabkürzungen aus dieser Dateinamen-Konvention:
     OT: 1.Mose, 2.Mose, ..., Ps, Spr, Pred, Jes, Jer, ...
     NT: Mt, Mk, Lk, Joh, Röm, 1.Kor, 2.Kor, Gal, Eph, Phil, Kol, 1.Thess, 2.Thess, 1.Tim, 2.Tim, Tit, Phlm, Hebr, Jak, 1.Petr, 2.Petr, 1.Joh, 2.Joh, 3.Joh, Jud, Offb

3. Schreibe für jede Stelle eine persönliche Deutung (3-5 Sätze): Was sagt dieser Text der Person in ihrer Situation?

Antworte ausschließlich als valides JSON im Format:
{
  "summary": "...",
  "passages": [
    {"reference": "Ps 23:1-6", "book": "Ps", "chapter": 23, "startVerse": 1, "endVerse": 6, "testament": "ot", "explanation": "..."},
    ...
  ]
}
```

---

## `bible-parser.js`

```js
// BOOK_MAP: maps AI-returned book name → filename prefix + testament
// e.g. "Ps" → { file: "Ps", testament: "ot" }
// e.g. "1.Kor" → { file: "1.Kor", testament: "nt" }

async function fetchVerses(testament, book, chapter, startVerse, endVerse) {
  const url = `/ELB2006-RoundtripHTML/${testament}/${book}_${chapter}.html`
  const html = await fetch(url).then(r => r.text())
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Extract div.v elements for verse range, strip footnote <sup> tags
  // Return array of { verse: number, text: string, heading?: string }
}
```

Key detail: `<sup class="fnm">` footnote markers werden entfernt, `<h3>` Abschnittsüberschriften werden beibehalten.

---

## `logger.js`

```js
// Speichert in localStorage wenn Logging aktiviert
function logEvent(type, data) { ... }
function exportSession() {
  // Erstellt JSON-Blob mit allen gespeicherten Events
  // Triggert Browser-Download als reflexion-[datum].json
}
```

---

## Vercel-Konfiguration (`vercel.json`)

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Env Vars auf Vercel: `ONE_API_KEY`, `ONE_API_BASE_URL=https://ai.ytels.de/v1`, `ONE_API_MODEL` (z.B. `gpt-4o` oder `claude-3-5-sonnet`)

---

## Design-Prinzipien (CSS)

- Mobile-first, großes Touch-Target für Text-Eingabe
- Farbpalette: Warmes Off-White + Dunkelblau/Tiefgrün, ruhige Typografie (z.B. System-Serif)
- Keine ablenkenden Animationen — dezente Fade-Übergänge zwischen Phasen
- Chat: WhatsApp-ähnliche Bubble-UI
- Bibelkarten: großer Schrift-Kontrast, Abschnittsüberschriften sichtbar

---

## Dateien die erstellt werden (von Null)

1. `package.json` — Vite, qrcode
2. `index.html` — App-Shell
3. `src/main.js`, `src/style.css`
4. `src/phases/consent.js`, `chat.js`, `summary.js`, `bible.js`
5. `src/bible-parser.js`, `src/logger.js`
6. `api/chat.js`, `api/reflect.js`
7. `vercel.json`, `.env.example`
8. `vite.config.js` — proxy `/api` auf Vite dev server

---

## Verifikation

1. `npm run dev` → App öffnet sich auf localhost
2. Consent-Screen: beide Logging-Optionen testen
3. Chat: mind. 5 Fragen beantworten → KI beendet selbst (`done: true`)
4. Reflect-API: gibt valides JSON mit 3 Stellen zurück
5. Bible-Parser: fetcht `ot/Ps_23.html`, extrahiert Verse 1-6 korrekt
6. Export: Download-Button erzeugt valide JSON-Datei
7. Mobile: im Browser-DevTools auf iPhone-Größe testen
8. Deploy auf Vercel: `vercel --prod`, QR-Code mit der Produktions-URL generieren
