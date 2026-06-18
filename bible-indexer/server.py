#!/usr/bin/env python3
"""
Bible Vector Search Server
POST /search  → Intent-Analyse + semantische Suche + MMR-Diversifizierung
POST /intent  → Nur Intent-Extraktion (für Debugging)
GET  /stats   → Datenbankstatistiken
GET  /health  → Health-Check
"""

import os
import re
import json
import asyncio
from pathlib import Path
from typing import Optional
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chromadb
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import httpx

# .env laden — lokaler Symlink oder Elternverzeichnis (lokale Entwicklung)
_script_dir = Path(__file__).parent
load_dotenv(_script_dir / ".env")              # /opt/bible-search/.env (Symlink auf Prod)
load_dotenv(_script_dir.parent / ".env")       # Fallback: lokale Entwicklung

ONE_API_BASE = os.getenv("ONE_API_BASE_URL", "https://ai.ytels.de/v1")
ONE_API_KEY  = os.getenv("ONE_API_KEY", "")
MODEL_NAME   = os.getenv("ONE_API_MODEL", "deepseek-ai/DeepSeek-V4-Flash")
EMBED_MODEL  = "intfloat/multilingual-e5-large"

# Version-Switch: BIBLE_INDEX_VERSION=v2 → chroma_db_v2, sonst chroma_db
_version = os.getenv("BIBLE_INDEX_VERSION", "").lower()
if _version == "v2":
    CHROMA_PATH      = Path(__file__).parent / "chroma_db_v2"
    COLLECTION_NAME  = "bible_sections_v2"
else:
    CHROMA_PATH      = Path(__file__).parent / "chroma_db"
    COLLECTION_NAME  = "bible_sections"

app = FastAPI(title="Bible Vector Search")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Lazy-load
_embed_model = None
_collection  = None

def get_embed_model():
    global _embed_model
    if _embed_model is None:
        print(f"Lade Embedding-Modell '{EMBED_MODEL}' …")
        _embed_model = SentenceTransformer(EMBED_MODEL)
        print("Modell geladen.")
    return _embed_model

def get_collection():
    global _collection
    if _collection is None:
        client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        _collection = client.get_collection(COLLECTION_NAME)
        print(f"ChromaDB geladen: {_collection.count()} Abschnitte (Version: {_version or 'v1'}, Collection: {COLLECTION_NAME})")
    return _collection

# ── Bekannte populäre Stellen → Popularitäts-Penalty ─────────────────
# Basis-IDs (ohne Suffix) erhalten einen Score-Abzug
POPULAR_IDS = {
    "Ps_23_1", "Jes_41_1", "Jes_40_28", "Joh_3_16", "Röm_8_28",
    "Phil_4_4", "Phil_4_6", "Jer_29_11", "1.Kor_13_1", "Mt_6_25",
    "Ps_91_1", "Ps_46_1", "Joh_14_1", "Mt_11_28", "Röm_8_31",
    "Jes_43_1", "Ps_139_1", "Spr_3_5", "Mt_28_20", "1.Petr_5_7",
}
POPULARITY_PENALTY = 0.10

# Feedback-Datei (geschrieben von api/feedback.js)
FEEDBACK_FILE = Path(__file__).parent.parent / "data" / "feedback.json"

def load_feedback() -> dict:
    try:
        return json.loads(FEEDBACK_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

def feedback_score_delta(section_id: str, feedback: dict) -> float:
    """
    Berechnet Score-Delta aus Nutzer-Feedback.
    too_common  → Penalty  (bis -0.15)
    good        → kleiner Bonus (+0.03 pro Stimme, max +0.06)
    great       → mittlerer Bonus (+0.06 pro Stimme, max +0.12)
    favorite    → großer Bonus (+0.08 pro Stimme, max +0.16)
    """
    base_id = re.sub(r"_\d+$", "", section_id)
    scores  = feedback.get(base_id) or feedback.get(section_id, {})
    if not scores:
        return 0.0

    penalty = min(scores.get("too_common", 0) * 0.05, 0.15)
    bonus   = (
        min(scores.get("good",     0) * 0.03, 0.06) +
        min(scores.get("great",    0) * 0.06, 0.12) +
        min(scores.get("favorite", 0) * 0.08, 0.16)
    )
    return bonus - penalty

# ── Pydantic-Modelle ──────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str                      # Freitext aus dem Chat
    emotions: list[str] = []        # Bereits extrahierte Emotionen (optional)
    situations: list[str] = []      # Bereits extrahierte Situationen (optional)
    n: int = 25                     # Anzahl Kandidaten zurückgeben
    diversity: float = 0.35         # MMR-Lambda: 0=max Diversität, 1=max Relevanz
    exclude_ids: list[str] = []     # Bereits gezeigte Abschnitte ausschließen

class IntentRequest(BaseModel):
    query: str

class SearchResult(BaseModel):
    id: str
    book: str
    book_name: str
    chapter: int
    testament: str
    start_verse: int
    end_verse: int
    heading: str
    reference: str
    text: str
    summary: str
    emotions: list[str]
    situations: list[str]
    actions: list[str]
    spiritual: list[str]
    literary_form: str
    intensity: str
    score: float
    score_breakdown: dict

# ── Intent-Analyse via LLM ────────────────────────────────────────────

INTENT_PROMPT = """Analysiere folgende Nutzereingabe und extrahiere strukturierte Suchanfragen.

Eingabe: "{query}"

Antworte NUR als JSON:
{{
  "search_query": "Reformulierung als semantische Suchanfrage für Bibelabschnitte (1-2 Sätze, beschreibt die Situation und das Bedürfnis)",
  "emotions": ["..."],
  "situations": ["..."],
  "actions": ["..."],
  "intensity": "leicht|mittel|existenziell"
}}

Wähle aus:
emotions: Angst, Trauer, Hoffnung, Freude, Dankbarkeit, Schuld, Scham, Wut, Einsamkeit, Erschöpfung, Frieden, Sehnsucht, Zweifel, Staunen, Liebe, Vertrauen, Verzweiflung
situations: Krankheit, Verlust, Entscheidung, Konflikt, Trennung, Neuanfang, Jobverlust, Armut, Ungerechtigkeit, Verfolgung, Warten, Erfolg, Trauer, Versagen, Gebet, Familie, Ehe, Einsamkeit
actions: Vertrauen, Loslassen, Entscheiden, Warten, Beten, Vergeben, Umkehren, Loben, Klagen, Suchen, Handeln, Ausharren, Annehmen, Helfen"""

async def extract_intent(query: str) -> dict:
    """Extrahiert strukturierten Intent aus Freitext via LLM."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{ONE_API_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {ONE_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": MODEL_NAME,
                      "messages": [{"role": "user",
                                    "content": INTENT_PROMPT.format(query=query[:800])}],
                      "max_tokens": 300,
                      "temperature": 0.2},
                timeout=15,
            )
        content = r.json()["choices"][0]["message"]["content"].strip()
        m = re.search(r"\{[\s\S]*\}", content)
        if m:
            return json.loads(m.group(0))
    except Exception as e:
        print(f"Intent-Extraktion fehlgeschlagen: {e}")
    # Fallback: leerer Intent
    return {"search_query": query, "emotions": [], "situations": [], "actions": [], "intensity": ""}


# ── MMR-Algorithmus ───────────────────────────────────────────────────

def mmr_select(query_emb: list, candidates: list[dict], n: int, lambda_: float) -> list[dict]:
    """
    Maximal Marginal Relevance.
    candidates: Liste mit .embedding und .sim_score
    Gibt n diversifizierte Kandidaten zurück.
    """
    if not candidates:
        return []

    q  = np.array(query_emb)
    C  = np.array([c["embedding"] for c in candidates])
    sq = np.array([c["sim_score"] for c in candidates])  # bereits penalisiert

    selected_idx = []
    remaining    = list(range(len(C)))

    for _ in range(min(n, len(C))):
        if not selected_idx:
            best = int(np.argmax([sq[i] for i in remaining]))
        else:
            sel_embs = C[selected_idx]
            scores   = []
            for r in remaining:
                c_emb = C[r]
                # Cosine similarity zu allen bereits gewählten
                denom = np.linalg.norm(c_emb) * np.linalg.norm(sel_embs, axis=1) + 1e-9
                sim_to_sel = float(np.max(c_emb @ sel_embs.T / denom))
                score = lambda_ * sq[r] - (1 - lambda_) * sim_to_sel
                scores.append(score)
            best = int(np.argmax(scores))

        idx = remaining[best]
        selected_idx.append(idx)
        remaining.remove(idx)

    return [candidates[i] for i in selected_idx]


# ── Diversitäts-Constraints ───────────────────────────────────────────

def apply_diversity_constraints(candidates: list[dict], n: int) -> list[dict]:
    """
    Harte Regeln für Buch-/Form-Diversität:
    - Max 1 Psalm
    - Max 2 aus demselben Buch
    - Mind. 1 AT + 1 NT wenn möglich
    """
    result      = []
    book_count  = {}
    psalm_count = 0
    has_ot      = False
    has_nt      = False

    # Zuerst AT+NT sicherstellen
    sorted_cands = sorted(candidates, key=lambda c: -c["sim_score"])

    for c in sorted_cands:
        if len(result) >= n:
            break
        book = c["meta"]["book"]
        is_psalm = book == "Ps"
        is_nt    = c["meta"]["testament"] == "nt"

        # Harte Limits
        if is_psalm and psalm_count >= 2:
            continue
        if book_count.get(book, 0) >= 2:
            continue

        result.append(c)
        book_count[book] = book_count.get(book, 0) + 1
        if is_psalm:
            psalm_count += 1
        if is_nt:
            has_nt = True
        else:
            has_ot = True

    return result


# ── Haupt-Suchendpunkt ────────────────────────────────────────────────

@app.post("/search", response_model=list[SearchResult])
async def search(req: SearchRequest):
    model      = get_embed_model()
    collection = get_collection()

    # Intent-Analyse (parallel zur Embedding-Erstellung)
    intent_task = asyncio.create_task(extract_intent(req.query))

    # Embedding der Suchanfrage
    embed_text = f"query: {req.query}"
    q_emb = model.encode(embed_text, normalize_embeddings=True).tolist()

    intent = await intent_task

    # Effektive Suchquery: Intent-reformuliert oder Original
    search_query = intent.get("search_query", req.query)
    if search_query != req.query:
        search_emb = model.encode(f"query: {search_query}", normalize_embeddings=True).tolist()
        # Durchschnitt aus Original + Intent-Query für robustere Suche
        q_combined = ((np.array(q_emb) + np.array(search_emb)) / 2).tolist()
    else:
        q_combined = q_emb

    # Gesamte Emotionen/Situationen aus Request + Intent
    all_emotions  = list(set((req.emotions or []) + intent.get("emotions", [])))
    all_situations = list(set((req.situations or []) + intent.get("situations", [])))

    # Fetch-Größe: großzügig für MMR-Pool
    n_fetch = min(req.n * 8, 300)

    # Versuche zuerst mit Metadaten-Filter, dann ohne
    results = None
    if all_emotions or all_situations:
        try:
            filters = []
            for e in all_emotions[:3]:  # max 3 für Performance
                filters.append({"emotions": {"$contains": e}})
            for s in all_situations[:2]:
                filters.append({"situations": {"$contains": s}})
            where = {"$or": filters} if len(filters) > 1 else filters[0]

            results = collection.query(
                query_embeddings=[q_combined],
                n_results=min(n_fetch // 2, collection.count()),
                where=where,
                include=["metadatas", "documents", "embeddings", "distances"],
            )
        except Exception:
            results = None

    # Immer auch ungefiltertes Suchen und mergen
    results_unfiltered = collection.query(
        query_embeddings=[q_combined],
        n_results=min(n_fetch, collection.count()),
        include=["metadatas", "documents", "embeddings", "distances"],
    )

    # Merge gefilterte + ungefilterte Ergebnisse
    all_ids   = list(results_unfiltered["ids"][0])
    all_metas = list(results_unfiltered["metadatas"][0])
    all_docs  = list(results_unfiltered["documents"][0])
    all_embs  = list(results_unfiltered["embeddings"][0])
    all_dists = list(results_unfiltered["distances"][0])

    if results and results["ids"][0]:
        seen_ids = set(all_ids)
        for id_, meta, doc, emb, dist in zip(
            results["ids"][0], results["metadatas"][0],
            results["documents"][0], results["embeddings"][0], results["distances"][0]
        ):
            if id_ not in seen_ids:
                all_ids.append(id_)
                all_metas.append(meta)
                all_docs.append(doc)
                all_embs.append(emb)
                all_dists.append(dist)
                seen_ids.add(id_)

    # Bereits gezeigte ausschließen
    exclude       = set(req.exclude_ids)
    feedback_data = load_feedback()
    candidates    = []
    for id_, meta, doc, emb, dist in zip(all_ids, all_metas, all_docs, all_embs, all_dists):
        if id_ in exclude:
            continue

        # Cosine Similarity (1 - cosine_distance)
        raw_sim = max(0.0, 1.0 - float(dist))

        # Popularitäts-Penalty
        base_id = re.sub(r"_\d+$", "", id_)
        popularity_penalty = POPULARITY_PENALTY if base_id in POPULAR_IDS else 0.0

        # Metadaten-Bonus: +0.03 pro übereinstimmender Emotion/Situation
        meta_bonus = 0.0
        sec_emotions   = [e for e in meta.get("emotions", "").split(",") if e]
        sec_situations = [s for s in meta.get("situations", "").split(",") if s]
        for e in all_emotions:
            if e in sec_emotions:
                meta_bonus += 0.03
        for s in all_situations:
            if s in sec_situations:
                meta_bonus += 0.02
        meta_bonus = min(meta_bonus, 0.12)  # Cap bei 0.12

        # Intensitäts-Alignment
        intent_intensity = intent.get("intensity", "")
        sec_intensity    = meta.get("intensity", "")
        intensity_bonus  = 0.02 if intent_intensity and intent_intensity == sec_intensity else 0.0

        # Nutzer-Feedback einrechnen
        fb_delta = feedback_score_delta(id_, feedback_data)

        final_score = raw_sim + meta_bonus + intensity_bonus - popularity_penalty + fb_delta

        candidates.append({
            "id":         id_,
            "meta":       meta,
            "doc":        doc,
            "embedding":  emb,
            "sim_score":  final_score,
            "score_breakdown": {
                "semantic":   round(raw_sim, 4),
                "meta_bonus": round(meta_bonus, 4),
                "intensity":  round(intensity_bonus, 4),
                "popularity": round(-popularity_penalty, 4),
                "feedback":   round(fb_delta, 4),
                "total":      round(final_score, 4),
            }
        })

    # Diversitäts-Constraints anwenden
    candidates = apply_diversity_constraints(candidates, req.n * 3)

    # MMR für finale Diversifizierung
    selected = mmr_select(q_combined, candidates, req.n, req.diversity)

    # Ergebnisse aufbauen
    output = []
    for c in selected:
        m = c["meta"]
        output.append(SearchResult(
            id           = c["id"],
            book         = m["book"],
            book_name    = m.get("book_name", ""),
            chapter      = int(m["chapter"]),
            testament    = m["testament"],
            start_verse  = int(m["start_verse"]),
            end_verse    = int(m["end_verse"]),
            heading      = m.get("heading", ""),
            reference    = m["reference"],
            text         = c["doc"],
            summary      = m.get("summary", ""),
            emotions     = [e for e in m.get("emotions", "").split(",") if e],
            situations   = [s for s in m.get("situations", "").split(",") if s],
            actions      = [a for a in m.get("actions", "").split(",") if a],
            spiritual    = [s for s in m.get("spiritual", "").split(",") if s],
            literary_form= m.get("literary_form", ""),
            intensity    = m.get("intensity", ""),
            score        = round(c["sim_score"], 4),
            score_breakdown = c["score_breakdown"],
        ))

    return output


@app.post("/intent")
async def intent_endpoint(req: IntentRequest):
    """Debug-Endpoint: Zeigt extrahierten Intent."""
    return await extract_intent(req.query)


@app.get("/stats")
async def stats():
    collection = get_collection()
    count = collection.count()
    # Stichprobe für Statistiken
    sample = collection.get(limit=min(100, count), include=["metadatas"])
    forms = {}
    for m in sample["metadatas"]:
        f = m.get("literary_form", "?")
        forms[f] = forms.get(f, 0) + 1
    return {
        "total_sections": count,
        "sample_forms": dict(sorted(forms.items(), key=lambda x: -x[1])),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "chroma_path": str(CHROMA_PATH)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("BIBLE_SEARCH_PORT", 3003))
    print(f"Bible Search Server auf http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
