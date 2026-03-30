#!/usr/bin/env python3
"""
Synthetic fleet data generator for ClearWay Analytics.

Generates realistic LiDAR-like CleanedMeasurement records that follow real road
geometries, with injected ground-truth obstacle zones for DBSCAN validation.

Usage (run from backend/):
    python scripts/generate_fleet_data.py \\
        --bbox 13.36,49.72,13.41,49.76 \\
        --num-trips 50 \\
        --date 2026-03-16 \\
        --seed 42

After running:
    python calculate_stats.py
"""

import sys
import os
import argparse
import datetime
import logging
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np
import networkx as nx
import psycopg2
import psycopg2.extras
from shapely import wkt as shapely_wkt
from shapely.geometry import Point
from shapely.ops import transform as shapely_transform
import pyproj

# ── bootstrap (identical pattern to setup_routing.py) ────────────────────────
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

DATABASE_URL = os.environ["DATABASE_URL"]

from app.database import SessionLocal
from app.models import Batch, Sensor, Vehicle, Session, RawMeasurement
from sqlalchemy import text as sa_text


# ── data structures ───────────────────────────────────────────────────────────

@dataclass
class ObstacleZone:
    center_lat: float
    center_lon: float
    radius_m: float
    override_width_cm: float = 240.0


@dataclass
class RoadEdge:
    source: int
    target: int
    road_type: str
    geometry_4326: object  # Shapely LineString in EPSG:4326


# (raw_measurement_id, cleaned_width, quality_score, wkt_point, created_at)
RecordTuple = tuple[int, float, float, str, datetime.datetime]


# ── configuration ─────────────────────────────────────────────────────────────

# Base width (cm) and standard deviation (cm) per OSM road type
ROAD_WIDTH_MODEL: dict[str, tuple[float, float]] = {
    "motorway":       (1000.0, 40.0),
    "motorway_link":  (800.0,  35.0),
    "trunk":          (800.0,  35.0),
    "trunk_link":     (700.0,  30.0),
    "primary":        (650.0,  30.0),
    "primary_link":   (600.0,  28.0),
    "secondary":      (550.0,  25.0),
    "secondary_link": (500.0,  23.0),
    "tertiary":       (450.0,  22.0),
    "tertiary_link":  (420.0,  20.0),
    "residential":    (350.0,  20.0),
    "living_street":  (320.0,  18.0),
    "service":        (300.0,  18.0),
    "unclassified":   (400.0,  22.0),
    "_default":       (450.0,  25.0),
}

SAMPLE_INTERVAL_M = 2.0  # metres between consecutive measurement points
GPS_JITTER_STD_M  = 0.3  # std dev of perpendicular GPS scatter in metres

# Ground-truth obstacle zones for Plzeň centre (bbox 13.36,49.72 → 13.41,49.76).
# Each zone guarantees ≥5 narrow-width samples (DBSCAN min_samples=5, eps=5m).
DEFAULT_OBSTACLE_ZONES: list[ObstacleZone] = [
    # 1. Náměstí Republiky — parked delivery van blocking entrance
    ObstacleZone(center_lat=49.7477, center_lon=13.3776, radius_m=12.0, override_width_cm=240.0),
    # 2. Sady Pětatřicátníků — construction fence beside park
    ObstacleZone(center_lat=49.7463, center_lon=13.3812, radius_m=10.0, override_width_cm=230.0),
    # 3. Pražská / Palacký bridge approach — skip container on carriageway
    ObstacleZone(center_lat=49.7441, center_lon=13.3741, radius_m=15.0, override_width_cm=250.0),
    # 4. Klatovská třída (southern corridor) — illegally parked truck
    ObstacleZone(center_lat=49.7385, center_lon=13.3802, radius_m=12.0, override_width_cm=220.0),
    # 5. Kollárova / Anglické nábřeží — roadwork barrier
    ObstacleZone(center_lat=49.7494, center_lon=13.3744, radius_m=10.0, override_width_cm=260.0),
]


# ── CRS transformers (module-level singletons) ────────────────────────────────

_proj_to_3857 = pyproj.Transformer.from_crs(4326, 3857, always_xy=True)
_proj_to_4326 = pyproj.Transformer.from_crs(3857, 4326, always_xy=True)


def _to_3857(geom):
    return shapely_transform(_proj_to_3857.transform, geom)


def _to_4326(geom):
    return shapely_transform(_proj_to_4326.transform, geom)


# ── helpers ───────────────────────────────────────────────────────────────────

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two WGS-84 points."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _in_obstacle_zone(lat: float, lon: float, zones: list[ObstacleZone]) -> Optional[ObstacleZone]:
    """Return the first ObstacleZone whose radius contains (lat, lon), or None."""
    for zone in zones:
        if _haversine_m(lat, lon, zone.center_lat, zone.center_lon) <= zone.radius_m:
            return zone
    return None


# ── Phase 0: FK anchor record ─────────────────────────────────────────────────

def create_session_raw_id(db, target_datetime: datetime.datetime) -> int:
    """
    Create a fresh Sensor → Vehicle → Session → Batch → RawMeasurement chain
    for this script run. Each invocation produces a distinct session so that
    session-based filtering in the frontend can distinguish individual runs.
    """
    label = f"Simulator {target_datetime.strftime('%Y-%m-%d %H:%M')}"
    logging.info(f"  Creating session chain for '{label}'...")

    sensor = Sensor(description=label, is_active=False)
    db.add(sensor)
    db.flush()

    vehicle = Vehicle(vehicle_name=label, width=200.0)
    db.add(vehicle)
    db.flush()

    session = Session(sensor_id=sensor.id, vehicle_id=vehicle.id)
    db.add(session)
    db.flush()

    batch = Batch(session_id=session.id, status="completed")
    db.add(batch)
    db.flush()

    raw = RawMeasurement(
        batch_id=batch.id,
        measured_at=target_datetime,
        latitude=49.7477,
        longitude=13.3776,
        distance_left=0.0,
        distance_right=0.0,
        is_valid=False,
    )
    db.add(raw)
    db.commit()
    logging.info(f"  Session raw_measurement id={raw.id}, measured_at={target_datetime}")
    return raw.id


# ── Phase 1: load road network ────────────────────────────────────────────────

_LOAD_SEGMENTS_SQL = """
    SELECT
        source,
        target,
        COALESCE(road_type, 'unclassified') AS road_type,
        ST_AsText(geom)                     AS geom_wkt
    FROM road_segments
    WHERE source IS NOT NULL
      AND target IS NOT NULL
      AND geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
"""

_LOAD_VERTICES_SQL = """
    SELECT id
    FROM road_segments_vertices_pgr
    WHERE the_geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
"""


def load_road_network(
    conn: psycopg2.extensions.connection,
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
) -> tuple[nx.DiGraph, list[int]]:
    """
    Load road segments and topology vertices from PostGIS within the bounding box.

    Returns:
        graph: NetworkX DiGraph; nodes are pgRouting vertex ids, edges carry
               {road_type, geometry_4326 (Shapely LineString), length_m}.
        vertex_ids: flat list of vertex ids for random trip endpoint selection.
    """
    bbox = (min_lon, min_lat, max_lon, max_lat)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute(_LOAD_SEGMENTS_SQL, bbox)
    segment_rows = cur.fetchall()

    graph: nx.DiGraph = nx.DiGraph()
    for row in segment_rows:
        geom = shapely_wkt.loads(row["geom_wkt"])
        length_m = _to_3857(geom).length
        attrs = {
            "road_type": row["road_type"],
            "geometry_4326": geom,
            "length_m": length_m,
        }
        # Add both directions so the graph is effectively undirected for routing
        graph.add_edge(row["source"], row["target"], **attrs)
        graph.add_edge(row["target"], row["source"], **attrs)

    cur.execute(_LOAD_VERTICES_SQL, bbox)
    vertex_ids = [r["id"] for r in cur.fetchall()]
    cur.close()

    return graph, vertex_ids


# ── Phase 2: generate trips ───────────────────────────────────────────────────

def generate_trips(
    graph: nx.DiGraph,
    vertex_ids: list[int],
    num_trips: int,
    rng: np.random.Generator,
) -> list[list[RoadEdge]]:
    """
    Generate num_trips virtual vehicle routes as ordered lists of RoadEdge.

    Picks random (A, B) vertex pairs and computes NetworkX shortest paths.
    Unreachable pairs are skipped; the loop retries up to 3*num_trips times.
    """
    trips: list[list[RoadEdge]] = []
    attempts = 0
    max_attempts = num_trips * 3

    while len(trips) < num_trips and attempts < max_attempts:
        attempts += 1
        indices = rng.choice(len(vertex_ids), size=2, replace=False)
        a, b = vertex_ids[indices[0]], vertex_ids[indices[1]]

        try:
            node_path = nx.shortest_path(graph, a, b, weight="length_m")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue

        edges: list[RoadEdge] = []
        for u, v in zip(node_path[:-1], node_path[1:]):
            data = graph[u][v]
            edges.append(RoadEdge(
                source=u,
                target=v,
                road_type=data["road_type"],
                geometry_4326=data["geometry_4326"],
            ))
        trips.append(edges)

    if len(trips) < num_trips:
        logging.warning(
            f"Only {len(trips)}/{num_trips} trips routed after {attempts} attempts. "
            "Consider a larger bbox or verify setup_routing.py has been run."
        )
    return trips


# ── Phase 3 + 4: sample points with sensor physics and obstacle injection ──────

def sample_route_points(
    trip_edges: list[RoadEdge],
    obstacle_zones: list[ObstacleZone],
    raw_measurement_id: int,
    target_datetime: datetime.datetime,
    rng: np.random.Generator,
) -> list[RecordTuple]:
    """
    Emit one measurement record every SAMPLE_INTERVAL_M metres along the trip.

    For each sample point:
      1. Project edge geometry to EPSG:3857.
      2. Interpolate on-road position at current distance.
      3. Compute local tangent → perpendicular unit vector.
      4. Apply Gaussian jitter (GPS noise) perpendicular to road in EPSG:3857.
      5. Back-project jittered position to EPSG:4326.
      6. Check obstacle zones using the pre-jitter on-road position.
      7. Sample cleaned_width from road-type model or use obstacle override.
    """
    records: list[RecordTuple] = []

    for edge in trip_edges:
        line_3857 = _to_3857(edge.geometry_4326)
        total_length = line_3857.length
        if total_length < SAMPLE_INTERVAL_M:
            continue

        base_width, width_std = ROAD_WIDTH_MODEL.get(
            edge.road_type, ROAD_WIDTH_MODEL["_default"]
        )

        distance = 0.0
        while distance <= total_length:
            p_3857 = line_3857.interpolate(distance)

            # Local tangent via two nearby points
            d_before = max(0.0, distance - 0.5)
            d_after  = min(total_length, distance + 0.5)
            pb = line_3857.interpolate(d_before)
            pa = line_3857.interpolate(d_after)
            dx, dy = pa.x - pb.x, pa.y - pb.y
            seg_len = math.sqrt(dx * dx + dy * dy)

            if seg_len > 0:
                # Perpendicular unit vector (90° rotation of normalised tangent)
                perp_x = -dy / seg_len
                perp_y =  dx / seg_len
                offset_m = float(rng.normal(0.0, GPS_JITTER_STD_M))
                jittered_3857 = Point(
                    p_3857.x + perp_x * offset_m,
                    p_3857.y + perp_y * offset_m,
                )
            else:
                jittered_3857 = p_3857

            # Back-project jittered point to EPSG:4326
            jittered_4326 = _to_4326(jittered_3857)
            lon, lat = jittered_4326.x, jittered_4326.y

            # Obstacle zone check uses the on-road (pre-jitter) position
            on_road_4326 = _to_4326(p_3857)
            zone = _in_obstacle_zone(on_road_4326.y, on_road_4326.x, obstacle_zones)

            if zone:
                width_cm = float(rng.normal(zone.override_width_cm, 10.0))
            else:
                width_cm = float(rng.normal(base_width, width_std))
                width_cm = max(50.0, width_cm)  # physical lower bound

            quality = float(rng.uniform(0.85, 1.0))

            records.append((
                raw_measurement_id,
                round(width_cm, 2),
                round(quality, 4),
                f"POINT({lon} {lat})",
                target_datetime,
            ))
            distance += SAMPLE_INTERVAL_M

    return records


# ── Phase 5: bulk insert ──────────────────────────────────────────────────────

_INSERT_SQL = """
    INSERT INTO cleaned_measurements
        (raw_measurement_id, cleaned_width, quality_score, geom, created_at)
    VALUES %s
"""
_INSERT_TEMPLATE = "(%s, %s, %s, ST_SetSRID(ST_GeomFromText(%s), 4326), %s)"


def bulk_insert(
    conn: psycopg2.extensions.connection,
    records: list[RecordTuple],
    batch_size: int,
) -> int:
    """
    Insert records into cleaned_measurements using psycopg2.extras.execute_values.

    Commits after each batch to bound memory pressure on the DB side.
    Returns total number of rows inserted.
    """
    total = 0
    cur = conn.cursor()
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        psycopg2.extras.execute_values(
            cur,
            _INSERT_SQL,
            batch,
            template=_INSERT_TEMPLATE,
            page_size=batch_size,
        )
        conn.commit()
        total += len(batch)
        logging.info(f"  Batch {i // batch_size + 1}: {total}/{len(records)} rows inserted")
    cur.close()
    return total


# ── CLI entry point ───────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic CleanedMeasurement records for ClearWay Analytics.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example:\n"
            "  python scripts/generate_fleet_data.py \\\n"
            "      --bbox 13.36,49.72,13.41,49.76 \\\n"
            "      --num-trips 50 --date 2026-03-16 --seed 42\n\n"
            "After running: python calculate_stats.py"
        ),
    )
    parser.add_argument(
        "--bbox",
        required=True,
        metavar="MIN_LON,MIN_LAT,MAX_LON,MAX_LAT",
        help="Bounding box. Example: 13.36,49.72,13.41,49.76",
    )
    parser.add_argument(
        "--num-trips", type=int, default=50, metavar="N",
        help="Number of virtual vehicle trips (default: 50).",
    )
    parser.add_argument(
        "--date",
        default=datetime.date.today().isoformat(),
        metavar="YYYY-MM-DD",
        help="Date to stamp all generated records with (default: today).",
    )
    parser.add_argument(
        "--time",
        default="08:00",
        metavar="HH:MM",
        help="Time of day for this measurement run (default: 08:00). "
             "Use different values across runs to create distinct sessions.",
    )
    parser.add_argument(
        "--seed", type=int, default=None, metavar="INT",
        help="Random seed for reproducibility (default: non-deterministic).",
    )
    parser.add_argument(
        "--batch-size", type=int, default=10_000, metavar="N",
        help="psycopg2 execute_values batch size (default: 10000).",
    )
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    args = parse_args()

    try:
        min_lon, min_lat, max_lon, max_lat = [float(x) for x in args.bbox.split(",")]
    except ValueError:
        logging.error("--bbox must be four comma-separated floats.")
        raise SystemExit(1)

    try:
        target_date = datetime.date.fromisoformat(args.date)
    except ValueError:
        logging.error("--date must be in YYYY-MM-DD format.")
        raise SystemExit(1)

    try:
        hour, minute = [int(x) for x in args.time.split(":")]
        target_datetime = datetime.datetime.combine(target_date, datetime.time(hour, minute, 0))
    except (ValueError, AttributeError):
        logging.error("--time must be in HH:MM format.")
        raise SystemExit(1)

    rng = np.random.default_rng(args.seed)
    if args.seed is not None:
        logging.info(f"Random seed: {args.seed}")

    # Phase 0 — create a fresh session chain for this run
    logging.info("Phase 0: Creating session chain...")
    db = SessionLocal()
    try:
        raw_measurement_id = create_session_raw_id(db, target_datetime)
    finally:
        db.close()

    # Phases 1–5 — road network + sampling + insert (psycopg2)
    conn = psycopg2.connect(DATABASE_URL)
    try:
        logging.info("Phase 1: Loading road network from PostGIS...")
        graph, vertex_ids = load_road_network(conn, min_lon, min_lat, max_lon, max_lat)
        edge_count = graph.number_of_edges() // 2  # DiGraph stores both directions
        logging.info(f"  {edge_count} edges, {len(vertex_ids)} vertices in bbox.")

        if edge_count == 0:
            logging.error(
                "No road segments found in bbox. "
                "Check coordinates and verify setup_routing.py has been run."
            )
            raise SystemExit(1)

        logging.info(f"Phase 2: Routing {args.num_trips} virtual trips via NetworkX...")
        trips = generate_trips(graph, vertex_ids, args.num_trips, rng)
        logging.info(f"  {len(trips)} trips routed.")

        logging.info("Phase 3/4: Sampling sensor points and injecting obstacle anomalies...")
        all_records: list[RecordTuple] = []
        for i, trip in enumerate(trips):
            trip_records = sample_route_points(
                trip, DEFAULT_OBSTACLE_ZONES, raw_measurement_id, target_datetime, rng
            )
            all_records.extend(trip_records)
            if (i + 1) % 10 == 0:
                logging.info(
                    f"  {i + 1}/{len(trips)} trips processed "
                    f"({len(all_records)} records so far)"
                )
        logging.info(f"  {len(all_records)} records generated.")

        obstacle_count = sum(1 for r in all_records if r[1] < 300.0)
        logging.info(
            f"  Ground-truth obstacle points: {obstacle_count} "
            f"({obstacle_count / max(len(all_records), 1) * 100:.1f}% of total)"
        )

        logging.info(f"Phase 5: Bulk inserting in batches of {args.batch_size}...")
        inserted = bulk_insert(conn, all_records, args.batch_size)
        logging.info(f"Done. {inserted} rows inserted for {target_date}.")
        logging.info("Next step: python calculate_stats.py")

    except SystemExit:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
