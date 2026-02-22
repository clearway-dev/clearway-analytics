#!/usr/bin/env python3
"""
Sets up pgRouting topology on the road_segments table.

Run once (or re-run safely — all steps are idempotent):
    python scripts/setup_routing.py

What this does:
  1. Installs the pgrouting PostgreSQL extension
  2. Adds seq_id (bigserial), source, target columns to road_segments
     (seq_id is needed because pgRouting requires an integer edge id;
      road_segments.id is UUID which is not supported by pgr_createTopology)
  3. Runs pgr_createTopology to populate those columns and create
     the road_segments_vertices_pgr table
  4. Creates spatial index on the vertices table for fast KNN snapping
  5. Creates indexes on source/target for faster Dijkstra queries
"""

import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Load .env before importing app.database so DATABASE_URL is available.
# Also replaces host.docker.internal with localhost so the script works
# when run directly on the host (outside Docker).
from dotenv import load_dotenv

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(env_path)

if not os.getenv("DATABASE_URL"):
    host = os.getenv("DB_HOST", "localhost").replace("host.docker.internal", "localhost")
    os.environ["DATABASE_URL"] = (
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{host}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME')}"
    )

from sqlalchemy import text
from app.database import engine


def setup_routing():
    with engine.begin() as conn:

        print("1/5  Installing pgRouting extension...")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgrouting"))

        print("2/5  Adding seq_id, source, target columns to road_segments...")
        conn.execute(text("""
            ALTER TABLE road_segments
                ADD COLUMN IF NOT EXISTS seq_id BIGSERIAL,
                ADD COLUMN IF NOT EXISTS source INTEGER,
                ADD COLUMN IF NOT EXISTS target INTEGER
        """))

        print("3/5  Building topology (may take a moment on large networks)...")
        # Tolerance 0.00001 degrees ≈ 1 m — snaps near-touching endpoints
        # Uses seq_id (bigserial) as the edge id — pgRouting requires integer, not UUID
        result = conn.execute(text("""
            SELECT pgr_createTopology('road_segments', 0.00001, 'geom', 'seq_id')
        """))
        status = result.scalar()
        print(f"     pgr_createTopology returned: {status}")

        print("4/5  Creating spatial index on vertices table...")
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS road_segments_vertices_geom_idx
            ON road_segments_vertices_pgr USING GIST(the_geom)
        """))

        print("5/5  Creating indexes on source / target columns...")
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS road_segments_source_idx
            ON road_segments (source)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS road_segments_target_idx
            ON road_segments (target)
        """))

        # Quick sanity check
        vertex_count = conn.execute(
            text("SELECT COUNT(*) FROM road_segments_vertices_pgr")
        ).scalar()
        edge_count = conn.execute(
            text("SELECT COUNT(*) FROM road_segments WHERE source IS NOT NULL")
        ).scalar()

        print()
        print("Done!")
        print(f"  Vertices : {vertex_count}")
        print(f"  Edges    : {edge_count}")


if __name__ == "__main__":
    setup_routing()
