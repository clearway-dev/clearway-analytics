#!/usr/bin/env python3
"""
Seeds the stations table with curated, verified emergency dispatch stations
in Plzeň (Pilsen), Czech Republic.

Sources:
  - HZS: hzscr.gov.cz
  - ZZS: zzspk.cz
  - PČR: policie.gov.cz
  - FN Plzeň: fnplzen.cz

Coordinates are resolved via Nominatim geocoding (openstreetmap.org).
Re-running is safe — existing rows (matched by notes field) are skipped.

Run from backend/:
    python scripts/seed_stations.py
"""

import sys
import os
import time
import json

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(env_path)

if not os.getenv("DATABASE_URL"):
    host = os.getenv("DB_HOST", "localhost").replace("host.docker.internal", "localhost")
    os.environ["DATABASE_URL"] = (
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{host}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME')}"
    )

import urllib.request
import urllib.parse
from sqlalchemy import text
from app.database import engine

# ---------------------------------------------------------------------------
# Curated stations — verified against official Czech sources (2024)
# Only stations that physically dispatch emergency vehicles.
# ---------------------------------------------------------------------------

STATIONS = [
    # ------------------------------------------------------------------
    # HZS Plzeňského kraje — professional fire stations (dispatch trucks)
    # Source: hzscr.gov.cz
    # ------------------------------------------------------------------
    {
        "name": "HZS Plzeňského kraje — Stanice Plzeň Střed",
        "type": "fire_station",
        "address": "Pobřežní 55/17, Plzeň",
        "notes": "hzs:plzen-stred",
    },
    {
        "name": "HZS Plzeňského kraje — Stanice Plzeň Košutka",
        "type": "fire_station",
        "address": "U Hasičů 2058/1, Plzeň",
        "notes": "hzs:plzen-kosutka",
    },
    {
        "name": "HZS Plzeňského kraje — Stanice Plzeň Slovany",
        "type": "fire_station",
        "address": "U Seřadiště 196, Plzeň",
        "notes": "hzs:plzen-slovany",
    },
    # ------------------------------------------------------------------
    # ZZS Plzeňského kraje — ambulance dispatch stations
    # Source: zzspk.cz/vyjezdove-zakladny
    # ------------------------------------------------------------------
    {
        "name": "ZZS Plzeňského kraje — Výjezdová základna Plzeň Bory",
        "type": "rescue",
        "address": "Klatovská třída 2960/200i, Plzeň",
        "notes": "zzs:plzen-bory",
    },
    {
        "name": "ZZS Plzeňského kraje — Výjezdová základna Plzeň Lochotín",
        "type": "rescue",
        "address": "Lidická 27, Plzeň",
        "notes": "zzs:plzen-lochotin",
    },
    {
        "name": "ZZS Plzeňského kraje — Výjezdová základna Plzeň Doubravka",
        "type": "rescue",
        "address": "Hřbitovní 1545/3a, Plzeň",
        "notes": "zzs:plzen-doubravka",
    },
    # ------------------------------------------------------------------
    # Fakultní nemocnice Plzeň — university hospital campuses
    # Source: fnplzen.cz
    # ------------------------------------------------------------------
    {
        "name": "Fakultní nemocnice Plzeň — Bory (urgentní příjem)",
        "type": "hospital",
        "address": "Edvarda Beneše 13, Plzeň-Bory",
        "notes": "fn:plzen-bory",
    },
    {
        "name": "Fakultní nemocnice Plzeň — Lochotín",
        "type": "hospital",
        "address": "Alej Svobody 923/80, Plzeň",
        "notes": "fn:plzen-lochotin",
    },
    # ------------------------------------------------------------------
    # Policie České republiky — obvodní oddělení (dispatch patrol cars 24/7)
    # Source: policie.gov.cz
    # ------------------------------------------------------------------
    {
        "name": "PČR — Obvodní oddělení Plzeň 1 (Lochotín)",
        "type": "police",
        "address": "Kaznějovská 2, Plzeň",
        "notes": "pcr:plzen-oo1",
    },
    {
        "name": "PČR — Obvodní oddělení Plzeň Střed",
        "type": "police",
        "address": "Anglické nábřeží 7, Plzeň",
        "notes": "pcr:plzen-stred",
    },
    {
        "name": "PČR — Obvodní oddělení Plzeň 2 (Slovany)",
        "type": "police",
        "address": "Nepomucká 43, Plzeň",
        "notes": "pcr:plzen-oo2",
    },
    {
        "name": "PČR — Obvodní oddělení Plzeň Bory",
        "type": "police",
        "address": "Nemocniční 8, Plzeň",
        "notes": "pcr:plzen-bory",
    },
    {
        "name": "PČR — Obvodní oddělení Plzeň Doubravka",
        "type": "police",
        "address": "Železniční 12, Plzeň",
        "notes": "pcr:plzen-doubravka",
    },
    {
        "name": "PČR — Obvodní oddělení Plzeň Skvrňany",
        "type": "police",
        "address": "Vejprnická 56, Plzeň",
        "notes": "pcr:plzen-skvrňany",
    },
    {
        "name": "PČR — Obvodní oddělení Plzeň Vinice",
        "type": "police",
        "address": "Strážnická 16A, Plzeň",
        "notes": "pcr:plzen-vinice",
    },
]

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "ClearWayAnalytics/1.0 (thesis project)"}


def geocode(address: str) -> tuple[float, float] | None:
    """Resolve address to (lat, lon) via Nominatim."""
    params = urllib.parse.urlencode({
        "q": address,
        "format": "json",
        "limit": "1",
        "countrycodes": "cz",
    })
    req = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers=NOMINATIM_HEADERS,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read().decode())
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        print(f"  Geocoding failed for '{address}': {e}")
    return None


def insert_stations(stations: list[dict]) -> tuple[int, int, int]:
    inserted = skipped = failed = 0

    with engine.begin() as conn:
        for s in stations:
            exists = conn.execute(
                text("SELECT 1 FROM stations WHERE notes = :notes"),
                {"notes": s["notes"]},
            ).first()
            if exists:
                print(f"  SKIP  {s['name']}")
                skipped += 1
                continue

            print(f"  GEO   {s['address']} … ", end="", flush=True)
            coords = geocode(s["address"])
            time.sleep(1.1)  # Nominatim rate limit: 1 req/s

            if coords is None:
                print("no result — skipping")
                failed += 1
                continue

            lat, lon = coords
            print(f"{lat:.5f}, {lon:.5f}")

            conn.execute(
                text("""
                    INSERT INTO stations (name, type, address, lat, lon, notes)
                    VALUES (:name, :type, :address, :lat, :lon, :notes)
                """),
                {
                    "name": s["name"],
                    "type": s["type"],
                    "address": s["address"],
                    "lat": lat,
                    "lon": lon,
                    "notes": s["notes"],
                },
            )
            inserted += 1

    return inserted, skipped, failed


def main():
    print(f"Seeding {len(STATIONS)} curated emergency stations for Plzeň…\n")
    inserted, skipped, failed = insert_stations(STATIONS)
    print(f"\nDone.  Inserted: {inserted}  |  Skipped: {skipped}  |  Failed: {failed}")


if __name__ == "__main__":
    main()
