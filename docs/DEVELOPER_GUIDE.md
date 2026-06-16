# MeinBibelKompass — Developer Guide

---

## Projektstruktur

```
biblereflexion/
├── src/                           # Frontend (Vite, Vanilla JS)
│   ├── main.js                    # Phasen-Router + Auth-Gate
│   ├── style.css                  # Design System (Dark Mode, CSS Custom Properties)
│   ├── menu.js                    # Hamburger-Menü, Docs-Overlay, Markdown-Renderer
│   ├── bible-parser.js            # HTML-Fetch + DOM-basierte Vers-Extraktion
│   ├── logger.js                  # Lokales Session-Logging (localStorage + JSON-Export)
│   └── phases/
│       ├── password.js            # Phase 0: Passwort-Gate (sessionStorage)
│       ├── consent.js             # Phase A: Startbildschirm
│       ├── chat.js                # Phase B: Adaptiver Chat-Flow
│       ├── summary.js             # Phase C: Ladescreen + SSE-Reader
│       └── bible.js               # Phase D: Ergebnisseite + alle Vertiefungen
├── api/
│   ├── chat.js                    # POST /api/chat — adaptive Folgefragen
│   ├── reflect.js                 # POST /api/reflect — RAG + Auswertung (SSE)
│   ├── enrich.js                  # POST /api/enrich — Begründung / Historisch
│   └── passage-chat.js            # POST /api/passage-chat — Bibelstellen-Chat (SSE)
├── bible-indexer/                 # RAG-Pipeline (Python)
│   ├── indexer.py                 # CLI: parse | tag | embed
│   ├── server.py                  # FastAPI Suchserver (Port 3003)
│   ├── wait_and_start.py          # Automatischer Start nach Tagging
│   ├── requirements.txt
│   ├── data/
│   │   ├── sections.json          # 2175 geparste Abschnitte
│   │   └── tagged.json            # + LLM-Tags (Emotionen, Situationen, …)
│   └── chroma_db/                 # Vektor-Datenbank (nicht im Repo)
├── ELB2006-RoundtripHTML/         # Bibel-HTML-Archiv (nicht im Repo)
├── public/
│   └── docs/                      # Statisch ausgelieferte Markdown-Docs
├── docs/                          # Quelldateien der Dokumentation
├── backup/v0.1/                   # Stand vor RAG-Integration
├── dist/                          # Vite Build-Output (nicht im Repo)
├── server.mjs                     # Produktions-HTTP-Server
├── api-dev-server.mjs             # Entwicklungs-API-Server
├── vite.config.js
├── package.json
└── .env                           # Nicht committen!
```

---

## Lokales Setup

### Voraussetzungen

- Node.js ≥ 18
- Python ≥ 3.10
- Die Bibel-HTML-Dateien (`ELB2006-RoundtripHTML/`) müssen lokal vorhanden sein

### Installation

```bash
# Node-Abhängigkeiten
npm install

# Python-Umgebung
cd bible-indexer
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### `.env` anlegen

```
ONE_API_BASE_URL=https://ai.ytels.de/v1
ONE_API_KEY=sk-...
ONE_API_MODEL=deepseek-ai/DeepSeek-V4-Flash
BIBLE_SEARCH_URL=http://localhost:3003
```

### Entwicklungsserver starten

```bash
# Terminal 1: Python Suchserver (benötigt chroma_db/)
cd bible-indexer && source venv/bin/activate && python server.py

# Terminal 2: Vite + Node-API
npm run dev
```

App läuft auf **http://localhost:5173**, API auf **http://localhost:3001**.

---

## Passwort-Schutz

Die App ist durch ein einfaches client-seitiges Passwort-Gate geschützt (`src/phases/password.js`). Das Passwort wird als Base64-String im Code gespeichert und per `sessionStorage` gemerkt (einmal pro Browser-Tab-Session).

Um das Passwort zu ändern: `PASSWORD_HASH = btoa('NeuPasswort')` in `password.js` anpassen, dann neu bauen und deployen.

> **Hinweis:** Dieser Schutz ist nicht kryptographisch sicher — er hält Zufallsbesucher ab, aber keinen gezielten Angreifer. Für echte Zugangskontrolle nginx Basic Auth verwenden.

---

## Menü & Dokumentations-Overlay

Das Hamburger-Menü (`src/menu.js`) ist eine globale Komponente, die einmalig beim App-Start via `initMenu()` in `main.js` initialisiert wird. Es rendert sich als fixe Leiste über allen Phasen.

Markdown-Dokumente werden per `fetch('/docs/*.md')` aus dem `public/docs/`-Verzeichnis geladen und mit `marked` (npm-Paket) gerendert.

**Docs aktualisieren:**
```bash
# Änderungen in docs/ vornehmen, dann in public/docs/ synchronisieren:
cp docs/USER_GUIDE.md docs/TECHNICAL_OVERVIEW.md docs/DEVELOPER_GUIDE.md public/docs/
npm run build
```

---

## API-Routen

### `POST /api/chat`

Generiert die nächste adaptive Frage basierend auf dem bisherigen Gesprächsverlauf.

**Request:**
```json
{
  "messages": [{ "role": "assistant|user", "content": "..." }],
  "questionCount": 3
}
```

**Response:**
```json
{ "question": "...", "suggestions": ["...", "..."], "done": false }
```

**Besonderheiten:**
- Bis zu 3 interne Retries bei leerem oder unparsbarem Modell-Response
- JSON-Reminder wird als Appendix der letzten User-Message eingefügt (DeepSeek-Workaround)
- `suggestions`-Validierung: leere oder `"..."`-Einträge werden gefiltert

---

### `POST /api/reflect`

Führt RAG-Suche durch und generiert Auswertung. Antwortet als **SSE-Stream**.

**Request:**
```json
{ "messages": [{ "role": "assistant|user", "content": "..." }] }
```

**SSE-Response (ein einzelnes Event):**
```
data: {"summary":"...","rag_used":true,"passages":[
  {"title":"...","reference":"...","book":"Ps","chapter":23,
   "startVerse":1,"endVerse":6,"testament":"ot","explanation":"..."}
]}\n\n
```

**Ablauf:**
1. `buildSearchQuery()` — alle User-Antworten als Suchstring
2. `searchCandidates()` — POST an `BIBLE_SEARCH_URL/search` (25s Timeout, Fallback auf Direkt-Prompt)
3. LLM erhält entweder 25 Kandidaten (RAG) oder keinen (Fallback)
4. Halluzinations-Validierung: gewählte Stellen gegen Kandidatenliste geprüft, Ersatz bei Mismatch
5. Vers-Grenzen aus Kandidatendaten übernommen

---

### `POST /api/enrich`

On-demand Vertiefung. Antwortet als SSE mit einem einzelnen JSON-Event.

**Request:**
```json
{
  "type": "reasoning | history",
  "passage": { "reference": "...", "text": "...", ... },
  "summary": "Lebenssituation"
}
```

---

### `POST /api/passage-chat`

Mehrstufiger Kontext-Chat. Token-Streaming via SSE.

**Request:**
```json
{
  "messages": [{ "role": "user|assistant", "content": "..." }],
  "passage": { "reference": "...", "text": "...", "title": "..." },
  "summary": "Lebenssituation",
  "explanation": "Persönliche Deutung"
}
```

**SSE-Response:**
```
data: {"token":"Das"}\n\n
data: {"token":" ist"}\n\n
...
data: {"done":true}\n\n
```

---

## Phasen-Router (`src/main.js`)

```
password → consent → chat → summary → bible
```

Jede Phase ersetzt das DOM komplett und gibt einen Callback an die nächste weiter:

```javascript
start()                              // prüft sessionStorage
renderPassword(onSuccess)            // onSuccess → startConsent
renderConsent(onStart)               // onStart(loggingEnabled)
renderChat(loggingEnabled, onComplete) // onComplete(messages)
renderSummary(messages, onReady)     // onReady(data)
renderBible(data, loggingEnabled)    // keine weitere Phase
```

---

## RAG-Pipeline (`bible-indexer/`)

### Indexer CLI

```bash
python indexer.py parse   # HTML → data/sections.json
python indexer.py tag     # LLM-Tagging → data/tagged.json (resumierbar)
python indexer.py embed   # Embeddings → chroma_db/
```

**parse:** 1189 HTML-Dateien → 2175 semantische Abschnitte (Perikopen anhand `<h3>`-Headings, Merge bei < 80 Wörtern).

**tag:** 5 parallele LLM-Calls via `asyncio.Semaphore(5)`, Checkpoint alle 50 Abschnitte, Resume bei Neustart.

**embed:** `intfloat/multilingual-e5-large` (~560 MB), ChromaDB PersistentClient. Metadaten als comma-separated strings (ChromaDB-Limitierung).

### Such-Server (`bible-indexer/server.py`)

FastAPI auf Port 3003, Lazy-Loading von Modell + DB.

**`POST /search`:** Embedding + Intent-Extraktion (parallel) → Hybrid-Score → MMR → 25 Kandidaten  
**`POST /intent`:** Debug-Endpoint  
**`GET /stats`:** Anzahl Abschnitte + Formverteilung  
**`GET /health`:** Health-Check

---

## Deployment

### Deploy-Workflow

```bash
# Docs synchronisieren (bei Änderungen)
cp docs/*.md public/docs/

# Frontend bauen
npm run build

# Frontend + API deployen
rsync -az -e "ssh -p 42709" dist/ root@ssh-ai.ytels.de:/opt/bibelreflexion/dist/
rsync -az -e "ssh -p 42709" api/*.js root@ssh-ai.ytels.de:/opt/bibelreflexion/api/
ssh -p 42709 root@ssh-ai.ytels.de "pm2 restart bibelreflexion --update-env"

# Nur Search-Server (nach Änderungen an server.py)
rsync -az -e "ssh -p 42709" bible-indexer/server.py root@ssh-ai.ytels.de:/opt/bible-search/
ssh -p 42709 root@ssh-ai.ytels.de "pm2 restart bible-search"
```

### Server-Prozesse

| Name | Befehl | Port |
|------|--------|------|
| `bibelreflexion` | `node server.mjs` | 3002 |
| `bible-search` | `bash start.sh` | 3003 |

### nginx-Konfiguration (wichtig)

```nginx
proxy_read_timeout 300s;
proxy_buffering off;   # Zwingend für SSE-Streaming!
```

### Logs prüfen

```bash
ssh -p 42709 root@ssh-ai.ytels.de "pm2 logs bibelreflexion --lines 20 --nostream"
ssh -p 42709 root@ssh-ai.ytels.de "pm2 logs bible-search --lines 20 --nostream"
```

---

## Bekannte Eigenheiten

### DeepSeek und JSON-Format

DeepSeek-V4-Flash folgt JSON-Vorgaben im System-Prompt nicht zuverlässig. Gegenmaßnahmen:
- JSON-Reminder als Appendix der User-Messages
- Bis zu 3 automatische Retries
- Regex-Extraktion des JSON-Objekts
- Fallback bei fehlenden `suggestions`: leere Liste

### One-API Idle-Timeout (~60s)

Lösung: `stream: true` in allen LLM-Calls — Token-Flow verhindert Idle-Timeout.

### Embedding-Modell Warmup

Das Modell (~2.3 GB RAM) lädt lazy beim ersten Request (~8s). Timeout in `reflect.js` ist 25s.

### NFC vs. NFD Dateinamen

macOS erstellt Dateinamen in NFD (Umlaute als combining characters), Linux erwartet NFC. Bei neuem Deployment:

```python
import unicodedata, os
for root, dirs, files in os.walk('ELB2006-RoundtripHTML'):
    for f in files:
        nfc = unicodedata.normalize('NFC', f)
        if f != nfc:
            os.rename(os.path.join(root, f), os.path.join(root, nfc))
```

---

## Erweiterungsmöglichkeiten

- **Nutzerfeedback** — 👍/👎 pro Bibelstelle, SQLite-Speicherung, Einfluss auf RAG-Scoring
- **Weitere Bibelübersetzungen** — neue ChromaDB-Collection, Übersetzungs-Selektor in UI
- **Session-Persistenz** — UUID-basierte Session-ID für Wiederherstellung
- **QR-Code mit Thema** — Moderator konfiguriert Thema vor, Teilnehmer starten direkt
- **nginx Basic Auth** — echter serverseitiger Zugriffsschutz statt client-seitigem Passwort
