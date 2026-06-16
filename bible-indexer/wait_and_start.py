#!/usr/bin/env python3
"""
Wartet bis Tagging fertig ist, startet dann embed + server.
Aufruf: python wait_and_start.py
"""
import json, time, subprocess, sys
from pathlib import Path

TAGGED_FILE  = Path(__file__).parent / "data/tagged.json"
SECTIONS_FILE = Path(__file__).parent / "data/sections.json"
TOTAL        = json.loads(SECTIONS_FILE.read_text())
TOTAL_COUNT  = len(TOTAL)

print(f"Warte auf Abschluss des Taggings ({TOTAL_COUNT} Abschnitte) …")
print("Fortschritt wird alle 60s geprüft. Ctrl+C zum Abbrechen.\n")

while True:
    if TAGGED_FILE.exists():
        tagged = json.loads(TAGGED_FILE.read_text())
        done   = sum(1 for s in tagged if s.get("tags"))
        pct    = 100 * done // TOTAL_COUNT
        print(f"  {done}/{TOTAL_COUNT} ({pct}%) getaggt …", end="\r")

        if done >= TOTAL_COUNT * 0.99:  # 99% reicht
            print(f"\n✓ Tagging abgeschlossen ({done}/{TOTAL_COUNT})")
            break
    time.sleep(60)

print("\nStarte Embedding-Pipeline …")
result = subprocess.run(
    [sys.executable, "indexer.py", "embed"],
    cwd=Path(__file__).parent,
)
if result.returncode != 0:
    print("Fehler beim Embedding!")
    sys.exit(1)

print("\n✓ Embeddings fertig. Starte Search-Server …")
subprocess.run([sys.executable, "server.py"], cwd=Path(__file__).parent)
