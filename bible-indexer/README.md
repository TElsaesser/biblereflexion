# Bibel-Indexer für Vektorsuche
# Liest ELB2006 HTML → LLM-Tagging → Embeddings → ChromaDB

## Setup

```bash
cd bible-indexer
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Ablauf

```bash
# 1. Bibel parsen und in Abschnitte zerlegen
python indexer.py parse

# 2. Abschnitte mit LLM taggen (Themen, Emotionen etc.)
python indexer.py tag

# 3. Embeddings erzeugen und in ChromaDB speichern
python indexer.py embed

# Alles in einem Schritt:
python indexer.py all

# Suchserver starten
python server.py
```

## Endpunkt

```
POST http://localhost:3003/search
{
  "query": "Ich bin erschöpft und finde keinen Ausweg",
  "emotions": ["Erschöpfung", "Hoffnungslosigkeit"],
  "n": 20
}
```

## Dateien

- `indexer.py` — Haupt-Pipeline
- `server.py` — FastAPI-Suchserver
- `data/sections.json` — geparste Abschnitte (Zwischenstand nach parse)
- `data/tagged.json` — getaggte Abschnitte (nach tag)
- `chroma_db/` — Vektordatenbank
