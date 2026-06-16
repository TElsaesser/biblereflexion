# MeinBibelKompass

**https://meinbibelkompass.ytels.de**

Ein KI-gestütztes Reflexions- und Bibelstellen-Tool. Teilnehmer führen ein kurzes persönliches Gespräch mit einer KI und erhalten drei semantisch passende Bibelstellen aus der Elberfelder Bibel 2006 – mit Deutung, Kontextanzeige, historischer Einordnung und einem Chat zu jeder Bibelstelle.

---

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [User Guide](docs/USER_GUIDE.md) | Anleitung für Endnutzer: Wie funktioniert die App? |
| [Technische Konzeptbeschreibung](docs/TECHNICAL_OVERVIEW.md) | Architektur und Designentscheidungen (ohne Implementierungsdetails) |
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Setup, API-Dokumentation, Deployment, bekannte Eigenheiten |

---

## Schnellstart (Entwicklung)

```bash
# Abhängigkeiten
npm install
cd bible-indexer && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..

# .env anlegen (ONE_API_KEY, ONE_API_BASE_URL, ONE_API_MODEL, BIBLE_SEARCH_URL)
cp .env.example .env

# Suchserver starten (benötigt chroma_db/)
cd bible-indexer && source venv/bin/activate && python server.py &

# App starten
npm run dev
```

→ http://localhost:5173

## Deployment

```bash
npm run build
rsync -az -e "ssh -p 42709" dist/ root@ssh-ai.ytels.de:/opt/bibelreflexion/dist/
rsync -az -e "ssh -p 42709" api/*.js root@ssh-ai.ytels.de:/opt/bibelreflexion/api/
ssh -p 42709 root@ssh-ai.ytels.de "pm2 restart bibelreflexion --update-env"
```

Ausführliche Anleitungen im [Developer Guide](docs/DEVELOPER_GUIDE.md).
