# MeinBibelKompass — Technische Konzeptbeschreibung

---

## Überblick

MeinBibelKompass ist ein webbasiertes Werkzeug zur spirituellen Reflexion. Es kombiniert konversationelle KI-Gesprächsführung mit semantischer Dokumentensuche, um aus einem Korpus religiöser Texte diejenigen Passagen zu identifizieren, die zur individuellen Lebenssituation eines Nutzers am besten passen.

Das System verfolgt einen **RAG-Ansatz** (Retrieval-Augmented Generation): Anstatt die KI direkt nach passenden Bibelstellen zu fragen, durchsucht ein spezialisierter Retrieval-Layer zuerst eine Vektordatenbank und übergibt der KI nur eine vorselektierte Kandidatenliste. Die KI fungiert damit als Kurator, nicht als primärer Wissensspeicher.

---

## Systemarchitektur

Das System besteht aus vier logischen Schichten:

```
┌─────────────────────────────────────────────────────┐
│  1. Konversationsschicht (Chat-Flow)                │
│     Adaptiver Dialog, Intent-Extraktion             │
├─────────────────────────────────────────────────────┤
│  2. Retrieval-Schicht (semantische Suche)           │
│     Embedding-Suche, MMR, Diversifizierung          │
├─────────────────────────────────────────────────────┤
│  3. Generierungs-Schicht (LLM-Kuratierung)          │
│     Auswahl aus Kandidaten, Deutungstexte           │
├─────────────────────────────────────────────────────┤
│  4. Vertiefungsschicht (On-Demand)                  │
│     Kontext-Chat, Begründung, Historische Einordnung│
└─────────────────────────────────────────────────────┘
```

---

## 1. Konversationsschicht

### Einstiegsfrage (lokal)

Die erste Frage wird nicht über eine KI generiert, sondern lokal aus einem vordefinierten Themen-Katalog präsentiert. Dies reduziert Latenz beim Start und stellt sicher, dass der Nutzer mit einem klar strukturierten Einstieg beginnt.

15 Themen: Unsicherheit/Angst, Erschöpfung, Traurigkeit/Verlust, Sehnsucht nach Orientierung, Dankbarkeit/Freude, Schuld/Vergebung, Einsamkeit/Konflikte, Zweifel, Krankheit, Familiäre Sorgen, Veränderung, Sehnsucht nach Frieden, Leistungsdruck, Hoffnung/Aufbruch, Sehnsucht nach Gottes Nähe.

### Adaptive Folgefragen

Ab Frage 2 werden alle Fragen von einem Sprachmodell generiert. Das Modell erhält den vollständigen bisherigen Gesprächsverlauf und antwortet im JSON-Format:

```json
{
  "question": "Die nächste Frage",
  "suggestions": ["Antwortchip 1", "Antwortchip 2", "..."]
}
```

**Suggestions** sind 10–14 kurze Antwortvorschläge (2–6 Wörter), die typische Reaktionen auf die jeweilige Frage abbilden. Sie dienen als kognitive Entlastung — der Nutzer muss nicht selbst formulieren, kann aber jederzeit eine eigene Antwort eingeben.

### Gesprächsende

Das Gespräch endet entweder durch das Modell (nach mindestens 5 Fragen), durch den Nutzer (vorzeitiger Abbruch ab Frage 2), oder automatisch nach 10 Fragen.

---

## 2. Retrieval-Schicht

### Dokumentenkorpus

Der Dokumentenkorpus umfasst die gesamte Elberfelder Bibel 2006 (AT und NT), aufgeteilt in **2175 semantische Abschnitte**. Die Granularität liegt zwischen Einzelversen (zu kurz, kein Kontext) und ganzen Kapiteln (zu lang, zu heterogen). Typisch sind Perikopen von 5–25 Versen.

### Vorverarbeitungs-Pipeline

Jeder Abschnitt durchläuft drei Stufen:

**1. Parsing** — HTML-Quelldateien werden geparst, Fußnoten und Formatierungsartefakte entfernt, Abschnittsüberschriften beibehalten. Ergebnis: sauberer Plaintext pro Abschnitt mit Metadaten (Buch, Kapitel, Versnummern, Testament).

**2. Tagging (LLM)** — Jeder Abschnitt wird einmalig von einem Sprachmodell semantisch eingeordnet:

```json
{
  "emotions": ["Angst", "Hoffnung"],
  "situations": ["Entscheidung", "Warten"],
  "actions": ["Vertrauen", "Ausharren"],
  "spiritual": ["Gebet", "Führung"],
  "literary_form": "Psalm",
  "intensity": "existenziell",
  "summary": "Ein Satz über den Inhalt"
}
```

**3. Embedding** — Jeder Abschnitt wird durch ein mehrsprachiges Embedding-Modell in einen hochdimensionalen Vektorraum projiziert. Die Vektoren werden in einer Vektordatenbank persistiert.

### Intent-Analyse

Aus dem abgeschlossenen Gespräch wird eine strukturierte Suchanfrage extrahiert:

- Reformulierter Suchtext (1–2 Sätze)
- Kategorisierte Emotionen, Situationen, Handlungsimpulse
- Intensitätseinstufung

### Hybride Suche

Die Suche kombiniert:

1. **Semantische Ähnlichkeit** — Cosine-Similarity zwischen Query-Embedding und Abschnitts-Embedding (Hauptgewicht)
2. **Metadaten-Bonus** — Übereinstimmung zwischen extrahierten Tags und Abschnitts-Tags (+0,03 pro Match, max. +0,12)
3. **Popularitäts-Penalty** — Bekannte, häufig zitierte Stellen erhalten einen kleinen Score-Abzug (−0,10), um Diversität zu fördern

### Diversifizierung (MMR)

Aus dem Score-gewichteten Kandidatenpool werden 25 Abschnitte durch **Maximal Marginal Relevance** ausgewählt. MMR balanciert Relevanz und Diversität: jeder neue Kandidat maximiert Ähnlichkeit zur Suchanfrage, minimiert gleichzeitig Ähnlichkeit zu bereits gewählten Kandidaten.

Zusätzliche Constraints:

- Maximal 2 Abschnitte aus demselben Buch
- Maximal 2 Psalmen
- Mindestens 1 AT-Abschnitt und 1 NT-Abschnitt

---

## 3. Generierungs-Schicht

Das Sprachmodell erhält die **25 Kandidaten** (nicht die gesamte Bibel) mit Metadaten, Summary und Textauszug und wählt die **3 am besten passenden** aus. Zusätzlich schreibt es:

- Eine Zusammenfassung der Lebenssituation (3–4 Sätze)
- Einen persönlichen Deutungstext pro Bibelstelle (10–14 Sätze)
- Eine kurze Überschrift pro Bibelstelle (4–7 Wörter)

**Halluzinations-Prävention:** Jede vom Modell zurückgegebene Referenz wird serverseitig gegen die Kandidatenliste validiert. Halluzinierte Stellen werden automatisch durch den besten ungenutzten Kandidaten ersetzt.

Die KI-Antwort wird als **Server-Sent Events (SSE)** gestreamt, um Timeout-Probleme bei langen Generierungszeiten zu vermeiden.

---

## 4. Vertiefungsschicht

Alle vier Vertiefungsfunktionen sind **lazy** — sie werden erst bei Bedarf geladen (Klick auf den jeweiligen Button).

| Funktion | Eingabe | Ausgabe |
|---|---|---|
| Ganzes Kapitel | testament, book, chapter | Vollständiger Bibeltext aus lokalem HTML |
| Warum diese Stelle? | Passage + Situation | 4–6 Sätze (LLM) |
| Historische Einordnung | Passage | 3 Abschnitte: historisch / Interpretationen / Relevanz (LLM) |
| Fragen stellen | Passage + Situation + Deutung + Verlauf | Mehrstufiger Streaming-Chat (LLM) |

---

## Zugangskontrolle

Die App ist durch ein client-seitiges Passwort-Gate geschützt. Das Passwort wird per `sessionStorage` gemerkt und muss einmal pro Browser-Tab-Session eingegeben werden. Dieser Schutz verhindert Zufallszugriffe, ist aber nicht kryptographisch sicher.

---

## Datenschutz und Logging

- Keine serverseitige Persistenz von Nutzerdaten.
- Gesprächsprotokolle werden optional lokal im Browser-Storage des Nutzers gespeichert.
- Texteingaben werden zur Verarbeitung an eine externe KI-API übertragen (keine Nutzerzuordnung).
- Der Nutzer kann das vollständige Protokoll als Datei exportieren.

---

## Qualitätsmechanismen

| Problem | Lösung |
|---|---|
| LLM gibt immer dieselben bekannten Verse | RAG: LLM sucht nicht selbst, sondern wählt aus Kandidaten |
| Mangelnde Diversität der Ergebnisse | MMR-Algorithmus + Buch/Form-Constraints |
| Populäre Stellen dominieren | Popularitäts-Penalty im Scoring |
| LLM halluziniert Bibelstellen | Serverseitige Validierung gegen Kandidatenliste |
| Timeout bei langen Generierungszeiten | SSE-Streaming hält Verbindung offen |
| JSON-Fehler in LLM-Antworten | Regex-Extraktion + automatische Retries |

---

## Skalierbarkeit

Das System kann auf andere Bibelübersetzungen oder religiöse Textsammlungen ausgedehnt werden — vorausgesetzt, die Texte werden neu geparst, getaggt und embedded. Die Such- und Generierungslogik ist übersetzungs-agnostisch.
