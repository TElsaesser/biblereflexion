#!/usr/bin/env python3
"""
Bibel-Indexer Pipeline
Schritte: parse → tag → embed
"""

import json
import os
import sys
import re
import time
import unicodedata
from pathlib import Path
from bs4 import BeautifulSoup
import httpx
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(Path(__file__).parent.parent / ".env")

BIBLE_DIR = Path(__file__).parent.parent / "ELB2006-RoundtripHTML"
DATA_DIR  = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

SECTIONS_FILE = DATA_DIR / "sections.json"
TAGGED_FILE   = DATA_DIR / "tagged.json"

SECTIONS_FILE_V2 = DATA_DIR / "sections_v2.json"
TAGGED_FILE_V2   = DATA_DIR / "tagged_v2.json"

ONE_API_BASE = os.getenv("ONE_API_BASE_URL", "https://ai.ytels.de/v1")
ONE_API_KEY  = os.getenv("ONE_API_KEY", "")
MODEL        = os.getenv("ONE_API_MODEL", "deepseek-ai/DeepSeek-V4-Flash")

# ──────────────────────────────────────────────────────────────────────
# SCHRITT 1: HTML parsen → Abschnitte extrahieren
# ──────────────────────────────────────────────────────────────────────

BOOK_ORDER = [
    # Altes Testament
    "1.Mose","2.Mose","3.Mose","4.Mose","5.Mose",
    "Jos","Ri","Rut","1.Sam","2.Sam","1.Kön","2.Kön",
    "1.Chr","2.Chr","Esra","Neh","Est","Hiob","Ps","Spr",
    "Pred","Hld","Jes","Jer","Klgl","Hes","Dan","Hos","Joel",
    "Am","Obd","Jona","Mi","Nah","Hab","Zef","Hag","Sach","Mal",
    # Neues Testament
    "Mt","Mk","Lk","Joh","Apg","Röm","1.Kor","2.Kor","Gal","Eph",
    "Phil","Kol","1.Thess","2.Thess","1.Tim","2.Tim","Tit","Phlm",
    "Hebr","Jak","1.Petr","2.Petr","1.Joh","2.Joh","3.Joh","Jud","Offb",
]

NT_BOOKS = {
    "Mt","Mk","Lk","Joh","Apg","Röm","1.Kor","2.Kor","Gal","Eph",
    "Phil","Kol","1.Thess","2.Thess","1.Tim","2.Tim","Tit","Phlm",
    "Hebr","Jak","1.Petr","2.Petr","1.Joh","2.Joh","3.Joh","Jud","Offb",
}

def nfc(s):
    return unicodedata.normalize("NFC", s)

def parse_chapter_file(html_path: Path) -> list[dict]:
    """Parst eine Kapitel-HTML-Datei und gibt Abschnitte zurück."""
    testament = "nt" if html_path.parent.name == "nt" else "ot"
    filename  = html_path.stem  # z.B. "Joh_3"
    parts     = filename.rsplit("_", 1)
    book      = nfc(parts[0])
    chapter   = int(parts[1])

    text = html_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(text, "html.parser")

    # Buchtitel aus <title>
    title_tag = soup.find("title")
    full_book_name = ""
    if title_tag:
        t = title_tag.get_text()
        m = re.match(r".+?–\s*(.+?)\s*–", t)
        if m:
            full_book_name = m.group(1).strip()

    # Alle Vers-Divs
    verse_divs = soup.select("div.v[id]")
    if not verse_divs:
        return []

    # Abschnitte aufbauen: h3 startet neuen Abschnitt
    sections = []
    current_section_heading = None
    current_start_verse = None
    current_verses = []

    def flush_section():
        nonlocal current_section_heading, current_start_verse, current_verses
        if not current_verses:
            return
        verses_text = " ".join(current_verses)
        word_count  = len(verses_text.split())
        sections.append({
            "id":           f"{book}_{chapter}_{current_start_verse}",
            "book":         book,
            "book_name":    full_book_name,
            "chapter":      chapter,
            "testament":    testament,
            "start_verse":  current_start_verse,
            "end_verse":    current_start_verse + len(current_verses) - 1,
            "heading":      current_section_heading or "",
            "text":         verses_text,
            "word_count":   word_count,
            "reference":    f"{book} {chapter},{current_start_verse}–{current_start_verse + len(current_verses) - 1}",
            "popularity":   0,   # wird später befüllt
            "tags":         None,  # wird in Schritt 2 befüllt
        })
        current_verses = []
        current_section_heading = None
        current_start_verse = None

    for div in verse_divs:
        verse_id = div.get("id", "")
        if not verse_id.startswith("v"):
            continue
        try:
            verse_num = int(verse_id[1:])
        except ValueError:
            continue

        # h3 = neuer Abschnitt
        h3 = div.find("h3")
        if h3:
            flush_section()
            current_section_heading = h3.get_text(strip=True)
            current_start_verse = verse_num

        if current_start_verse is None:
            current_start_verse = verse_num

        # Verse-Text bereinigen
        clone = BeautifulSoup(str(div), "html.parser").find("div")
        for tag in clone.find_all(["sup", "h3", "span"], class_=lambda c: c and ("fnm" in c or "vn" in c or "br-p" in c)):
            tag.decompose()
        verse_text = clone.get_text(" ", strip=True)
        verse_text = re.sub(r"\s+", " ", verse_text).strip()
        if verse_text:
            current_verses.append(verse_text)

    flush_section()

    # Abschnitte unter 40 Wörtern mit dem nächsten zusammenführen
    merged = []
    i = 0
    while i < len(sections):
        s = sections[i]
        if s["word_count"] < 40 and i + 1 < len(sections):
            nxt = sections[i + 1]
            merged_text = s["text"] + " " + nxt["text"]
            merged.append({**s,
                "text":       merged_text,
                "end_verse":  nxt["end_verse"],
                "word_count": len(merged_text.split()),
                "reference":  f"{book} {chapter},{s['start_verse']}–{nxt['end_verse']}",
            })
            i += 2
        else:
            merged.append(s)
            i += 1

    return merged


def cmd_parse():
    print("Schritt 1: HTML-Dateien parsen …")
    all_sections = []

    # Nach Kanon-Reihenfolge sortieren
    html_files = []
    for testament in ("ot", "nt"):
        for f in sorted((BIBLE_DIR / testament).glob("*.html")):
            html_files.append(f)

    for f in tqdm(html_files, unit="Kapitel"):
        try:
            secs = parse_chapter_file(f)
            all_sections.extend(secs)
        except Exception as e:
            print(f"\nFehler bei {f.name}: {e}")

    # IDs deduplizieren
    seen = {}
    for s in all_sections:
        base = s["id"]
        if base in seen:
            seen[base] += 1
            s["id"] = f"{base}_{seen[base]}"
        else:
            seen[base] = 0

    SECTIONS_FILE.write_text(json.dumps(all_sections, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"→ {len(all_sections)} Abschnitte in {SECTIONS_FILE}")


# ──────────────────────────────────────────────────────────────────────
# SCHRITT 2: LLM-Tagging
# ──────────────────────────────────────────────────────────────────────

TAG_PROMPT = """Du analysierst einen Bibelabschnitt und vergibst strukturierte Tags.

Abschnitt: {reference} – {heading}
Text (gekürzt): {text}

Antworte NUR als valides JSON, kein Markdown:
{{
  "emotions": ["..."],
  "situations": ["..."],
  "actions": ["..."],
  "spiritual": ["..."],
  "literary_form": "...",
  "intensity": "leicht|mittel|existenziell",
  "summary": "Ein Satz, der den Kern des Abschnitts beschreibt."
}}

Wähle aus diesen Listen (mehrere möglich):

emotions: Angst, Trauer, Hoffnung, Freude, Dankbarkeit, Schuld, Scham, Wut, Einsamkeit, Erschöpfung, Frieden, Sehnsucht, Zweifel, Staunen, Liebe, Vertrauen, Verzweiflung

situations: Krankheit, Verlust, Entscheidung, Konflikt, Trennung, Neuanfang, Jobverlust, Armut, Ungerechtigkeit, Verfolgung, Warten, Erfolg, Feier, Trauer, Versagen, Gebet, Gottesdienst, Familie, Ehe, Einsamkeit

actions: Vertrauen, Loslassen, Entscheiden, Warten, Beten, Vergeben, Umkehren, Loben, Klagen, Suchen, Handeln, Ausharren, Annehmen, Helfen

spiritual: Gottesnähe, Gebet, Glaube, Zweifel, Berufung, Vergebung, Heiligung, Erlösung, Trost, Führung, Sinn, Ewigkeit, Versöhnung, Gegenwart Gottes

literary_form (genau einen): Psalm, Gebet, Gleichnis, Erzählung, Weisheit, Prophetie, Brief, Apokalypse, Lied, Gesetz, Genealogie, Predigt"""


import asyncio
import httpx as _httpx_sync

async def call_llm_tag_async(section: dict, client: httpx.AsyncClient) -> dict | None:
    text_preview = section["text"][:600]
    prompt = TAG_PROMPT.format(
        reference=section["reference"],
        heading=section["heading"],
        text=text_preview,
    )
    try:
        r = await client.post(
            f"{ONE_API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {ONE_API_KEY}",
                     "Content-Type": "application/json"},
            json={"model": MODEL,
                  "messages": [{"role": "user", "content": prompt}],
                  "max_tokens": 400,
                  "temperature": 0.3},
            timeout=60,
        )
        content = r.json()["choices"][0]["message"]["content"].strip()
        m = re.search(r"\{[\s\S]*\}", content)
        if not m:
            return None
        return json.loads(m.group(0))
    except Exception:
        return None


def call_llm_tag(section: dict) -> dict | None:
    text_preview = section["text"][:600]
    prompt = TAG_PROMPT.format(
        reference=section["reference"],
        heading=section["heading"],
        text=text_preview,
    )
    try:
        r = _httpx_sync.post(
            f"{ONE_API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {ONE_API_KEY}",
                     "Content-Type": "application/json"},
            json={"model": MODEL,
                  "messages": [{"role": "user", "content": prompt}],
                  "max_tokens": 400,
                  "temperature": 0.3},
            timeout=60,
        )
        content = r.json()["choices"][0]["message"]["content"].strip()
        m = re.search(r"\{[\s\S]*\}", content)
        if not m:
            return None
        return json.loads(m.group(0))
    except Exception:
        return None


def cmd_tag(resume=True, sections_file=None, tagged_file=None, concurrency=5):
    sections_file = sections_file or SECTIONS_FILE
    tagged_file   = tagged_file   or TAGGED_FILE
    print(f"Schritt 2: LLM-Tagging ({sections_file.name}) …")
    sections = json.loads(sections_file.read_text(encoding="utf-8"))

    already_tagged = set()
    if resume and tagged_file.exists():
        tagged = json.loads(tagged_file.read_text(encoding="utf-8"))
        already_tagged = {s["id"] for s in tagged if s.get("tags")}
        print(f"  Überspringe {len(already_tagged)} bereits getaggte Abschnitte")
    else:
        tagged = []

    tagged_map = {s["id"]: s for s in tagged}
    to_tag = [s for s in sections if s["id"] not in already_tagged]
    print(f"  Tagging {len(to_tag)} Abschnitte mit {concurrency} parallelen Calls …")

    async def run():
        sem = asyncio.Semaphore(concurrency)
        progress = tqdm(total=len(to_tag), unit="Abschnitt")
        lock = asyncio.Lock()
        done_count = [0]
        errors = [0]

        async with httpx.AsyncClient() as client:
            async def tag_one(section):
                async with sem:
                    tags = await call_llm_tag_async(section, client)
                    async with lock:
                        section["tags"] = tags
                        tagged_map[section["id"]] = section
                        done_count[0] += 1
                        if tags is None:
                            errors[0] += 1
                        if done_count[0] % 50 == 0:
                            _save_tagged(tagged_map, sections, tagged_file)
                        progress.update(1)

            tasks = [tag_one(s) for s in to_tag]
            await asyncio.gather(*tasks)

        progress.close()

    asyncio.run(run())
    _save_tagged(tagged_map, sections, tagged_file)
    tagged_count = sum(1 for s in tagged_map.values() if s.get("tags"))
    print(f"→ {tagged_count}/{len(sections)} Abschnitte getaggt in {tagged_file}")


def _save_tagged(tagged_map, sections, out_file=None):
    out_file = out_file or TAGGED_FILE
    result = []
    for s in sections:
        if s["id"] in tagged_map:
            result.append(tagged_map[s["id"]])
        else:
            result.append(s)
    out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


# ──────────────────────────────────────────────────────────────────────
# SCHRITT 3: Embeddings + ChromaDB
# ──────────────────────────────────────────────────────────────────────

def cmd_embed(tagged_file=None, chroma_path=None, collection_name="bible_sections"):
    import chromadb
    from sentence_transformers import SentenceTransformer

    tagged_file = tagged_file or (TAGGED_FILE if TAGGED_FILE.exists() else SECTIONS_FILE)
    chroma_path = chroma_path or (Path(__file__).parent / "chroma_db")

    print(f"Schritt 3: Embeddings → {chroma_path.name} (Collection: {collection_name}) …")

    sections = json.loads(tagged_file.read_text(encoding="utf-8"))
    print(f"  Lade Modell 'intfloat/multilingual-e5-large' …")
    model = SentenceTransformer("intfloat/multilingual-e5-large")

    client = chromadb.PersistentClient(path=str(chroma_path))
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    collection = client.create_collection(
        collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    BATCH = 64
    for i in tqdm(range(0, len(sections), BATCH), unit="batch"):
        batch = sections[i:i+BATCH]

        # Embedding-Text: Heading + Summary (wenn vorhanden) + Text-Anfang
        embed_texts = []
        for s in batch:
            tags = s.get("tags") or {}
            summary = tags.get("summary", "")
            heading = s.get("heading", "")
            text_preview = s["text"][:400]
            embed_text = f"passage: {heading}. {summary} {text_preview}".strip()
            embed_texts.append(embed_text)

        embeddings = model.encode(embed_texts, normalize_embeddings=True).tolist()

        ids        = [s["id"] for s in batch]
        documents  = [s["text"] for s in batch]
        metadatas  = []
        for s in batch:
            tags = s.get("tags") or {}
            meta = {
                "book":         s["book"],
                "book_name":    s["book_name"],
                "chapter":      str(s["chapter"]),
                "testament":    s["testament"],
                "start_verse":  str(s["start_verse"]),
                "end_verse":    str(s["end_verse"]),
                "heading":      s.get("heading", ""),
                "reference":    s["reference"],
                "word_count":   str(s["word_count"]),
                "popularity":   str(s.get("popularity", 0)),
                "literary_form": tags.get("literary_form", ""),
                "intensity":    tags.get("intensity", ""),
                "summary":      tags.get("summary", "")[:500] if tags.get("summary") else "",
                "emotions":     ",".join(tags.get("emotions", [])),
                "situations":   ",".join(tags.get("situations", [])),
                "actions":      ",".join(tags.get("actions", [])),
                "spiritual":    ",".join(tags.get("spiritual", [])),
            }
            metadatas.append(meta)

        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )

    print(f"→ {len(sections)} Abschnitte in ChromaDB ({chroma_path})")


# ──────────────────────────────────────────────────────────────────────
# V2: Parser mit <br-p>-Aufteilung
# ──────────────────────────────────────────────────────────────────────

MIN_VERSES_V2 = 4   # Abschnitt muss mindestens 4 Verse haben
MAX_VERSES_V2 = 22  # Abschnitt darf maximal 22 Verse haben

def parse_chapter_file_v2(html_path: Path) -> list[dict]:
    """
    Wie parse_chapter_file, aber teilt zusätzlich an <span class='br-p'>-Absatzmarkern auf.
    Ergibt kürzere, thematisch einheitlichere Abschnitte.
    """
    testament = "nt" if html_path.parent.name == "nt" else "ot"
    filename  = html_path.stem
    parts     = filename.rsplit("_", 1)
    book      = nfc(parts[0])
    chapter   = int(parts[1])

    text = html_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(text, "html.parser")

    title_tag = soup.find("title")
    full_book_name = ""
    if title_tag:
        t = title_tag.get_text()
        m = re.match(r".+?–\s*(.+?)\s*–", t)
        if m:
            full_book_name = m.group(1).strip()

    verse_divs = soup.select("div.v[id]")
    if not verse_divs:
        return []

    # Jeden Vers parsen: Text, Vers-Nr., hat h3, hat br-p (Absatzende)
    parsed_verses = []
    for div in verse_divs:
        verse_id = div.get("id", "")
        if not verse_id.startswith("v"):
            continue
        try:
            verse_num = int(verse_id[1:])
        except ValueError:
            continue

        h3 = div.find("h3")
        heading = h3.get_text(strip=True) if h3 else None
        has_brp = bool(div.find("span", class_="br-p"))

        clone = BeautifulSoup(str(div), "html.parser").find("div")
        for tag in clone.find_all(["sup", "h3", "span"],
                                   class_=lambda c: c and ("fnm" in c or "vn" in c or "br-p" in c)):
            tag.decompose()
        verse_text = re.sub(r"\s+", " ", clone.get_text(" ", strip=True)).strip()

        parsed_verses.append({
            "num": verse_num,
            "text": verse_text,
            "heading": heading,
            "paragraph_end": has_brp,
        })

    if not parsed_verses:
        return []

    # Abschnitte bilden: h3 oder br-p = potenzielle Grenze
    raw_sections = []
    current = []
    current_heading = parsed_verses[0]["heading"] if parsed_verses else None

    for v in parsed_verses:
        if v["heading"] and current:
            # h3 = harte Grenze: immer teilen
            raw_sections.append((current_heading, current))
            current = []
            current_heading = v["heading"]
        current.append(v)
        if v["paragraph_end"] and len(current) >= MIN_VERSES_V2:
            # br-p = weiche Grenze: nur teilen wenn Mindestlänge erreicht
            raw_sections.append((current_heading, current))
            current = []
            current_heading = None

    if current:
        raw_sections.append((current_heading, current))

    # Zu kurze Abschnitte mit dem nächsten zusammenführen
    merged = []
    i = 0
    while i < len(raw_sections):
        heading, verses = raw_sections[i]
        if len(verses) < MIN_VERSES_V2 and i + 1 < len(raw_sections):
            next_h, next_v = raw_sections[i + 1]
            raw_sections[i + 1] = (heading or next_h, verses + next_v)
            i += 1
            continue
        merged.append((heading, verses))
        i += 1

    # Zu lange Abschnitte halbieren (Fallback)
    final = []
    for heading, verses in merged:
        if len(verses) > MAX_VERSES_V2:
            mid = len(verses) // 2
            final.append((heading, verses[:mid]))
            final.append((None, verses[mid:]))
        else:
            final.append((heading, verses))

    # Zu Sections-Dicts konvertieren
    sections = []
    for heading, verses in final:
        if not verses:
            continue
        verses_text = " ".join(v["text"] for v in verses if v["text"])
        start_v = verses[0]["num"]
        end_v   = verses[-1]["num"]
        sections.append({
            "id":          f"{book}_{chapter}_{start_v}",
            "book":        book,
            "book_name":   full_book_name,
            "chapter":     chapter,
            "testament":   testament,
            "start_verse": start_v,
            "end_verse":   end_v,
            "heading":     heading or "",
            "text":        verses_text,
            "word_count":  len(verses_text.split()),
            "reference":   f"{book} {chapter},{start_v}–{end_v}",
            "popularity":  0,
            "tags":        None,
        })

    return sections


def cmd_parse_v2():
    print("Schritt 1 (v2): HTML-Dateien mit <br-p>-Aufteilung parsen …")
    all_sections = []

    html_files = []
    for testament in ("ot", "nt"):
        for f in sorted((BIBLE_DIR / testament).glob("*.html")):
            html_files.append(f)

    for f in tqdm(html_files, unit="Kapitel"):
        try:
            secs = parse_chapter_file_v2(f)
            all_sections.extend(secs)
        except Exception as e:
            print(f"\nFehler bei {f.name}: {e}")

    # IDs deduplizieren
    seen = {}
    for s in all_sections:
        base = s["id"]
        if base in seen:
            seen[base] += 1
            s["id"] = f"{base}_{seen[base]}"
        else:
            seen[base] = 0

    SECTIONS_FILE_V2.write_text(
        json.dumps(all_sections, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    words = [s["word_count"] for s in all_sections]
    print(f"→ {len(all_sections)} Abschnitte in {SECTIONS_FILE_V2}")
    print(f"  Min: {min(words)}, Max: {max(words)}, Median: {sorted(words)[len(words)//2]} Wörter")


# ──────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "parse":
        cmd_parse()
    elif cmd == "tag":
        cmd_tag()
    elif cmd == "embed":
        cmd_embed()
    elif cmd == "all":
        cmd_parse()
        cmd_tag()
        cmd_embed()
    elif cmd == "parse_v2":
        cmd_parse_v2()
    elif cmd == "tag_v2":
        cmd_tag(
            sections_file=SECTIONS_FILE_V2,
            tagged_file=TAGGED_FILE_V2,
        )
    elif cmd == "embed_v2":
        cmd_embed(
            tagged_file=TAGGED_FILE_V2,
            chroma_path=Path(__file__).parent / "chroma_db_v2",
            collection_name="bible_sections_v2",
        )
    elif cmd == "all_v2":
        cmd_parse_v2()
        cmd_tag(sections_file=SECTIONS_FILE_V2, tagged_file=TAGGED_FILE_V2)
        cmd_embed(
            tagged_file=TAGGED_FILE_V2,
            chroma_path=Path(__file__).parent / "chroma_db_v2",
            collection_name="bible_sections_v2",
        )
    else:
        print("Usage: python indexer.py [parse|tag|embed|all|parse_v2|tag_v2|embed_v2|all_v2]")
        print()
        print("  parse      — HTML parsen → data/sections.json")
        print("  tag        — LLM-Tagging → data/tagged.json")
        print("  embed      — Embeddings → chroma_db/")
        print("  all        — Alle Schritte (v1)")
        print()
        print("  parse_v2   — HTML parsen mit <br-p>-Aufteilung → data/sections_v2.json")
        print("  tag_v2     — LLM-Tagging → data/tagged_v2.json")
        print("  embed_v2   — Embeddings → chroma_db_v2/")
        print("  all_v2     — Alle Schritte (v2)")
