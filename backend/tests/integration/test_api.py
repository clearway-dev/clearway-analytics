"""
Integration tests for the ClearWay Analytics API.
All tests run against the live golden database image (pre-seeded Plzeň road network).
"""
from datetime import date, datetime

import pytest
from geoalchemy2 import WKTElement

from app.models import Batch, CleanedMeasurement, Cluster, Sensor, Vehicle, Session, RawMeasurement


# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------

def test_status_returns_200_and_db_connected(client):
    """GET /api/status must confirm database connectivity to the golden DB."""
    response = client.get("/api/status")
    assert response.status_code == 200
    body = response.json()
    assert body["database"] == "connected"
    assert body["test_query_result"] == 1


# ---------------------------------------------------------------------------
# 2. AI import — external LLM call is mocked
# ---------------------------------------------------------------------------

def test_parse_vehicle_with_mocked_llm_returns_parsed_data(client, mocker):
    """
    POST /api/ai/parse-vehicle must return 200 and well-shaped vehicle data.
    parse_vehicles_from_text is patched at the import site inside the endpoint
    module so no real Gemini API call is made and no API key is required.
    """
    mocked_result = [
        {
            "name": "CAS 24 SCANIA",
            "category": "fire_truck",
            "width": 255,
            "height": 340,
            "length": 765,
            "turning_diameter_track": 1600,
            "turning_diameter_clearance": None,
            "stabilization_width": None,
            "weight": 18.6,
        }
    ]
    mocker.patch(
        "app.api.endpoints.ai.parse_vehicles_from_text",
        return_value=mocked_result,
    )

    response = client.post(
        "/api/ai/parse-vehicle",
        json={"text": "CAS 24 SCANIA, šířka 2 550 mm, výška 3 400 mm, hmotnost 18,6 t"},
    )

    assert response.status_code == 200
    vehicles = response.json()
    assert len(vehicles) == 1
    assert vehicles[0]["name"] == "CAS 24 SCANIA"
    assert vehicles[0]["category"] == "fire_truck"
    assert vehicles[0]["width"] == 255


# ---------------------------------------------------------------------------
# 3. DBSCAN obstacle detection
# ---------------------------------------------------------------------------

# A historical date with no pre-existing data — avoids collisions with seeded data.
_TEST_DATE = date(2020, 1, 1)
_TEST_DATETIME = datetime(2020, 1, 1, 12, 0, 0)

# Central Plzeň — all points within ~1 m of each other, well inside the 5 m epsilon.
_BASE_LAT = 49.747000
_BASE_LON = 13.377000

_CLUSTER_SIZE = 10


@pytest.fixture
def obstacle_measurements(db):
    """
    Insert the full prerequisite chain (Sensor → Vehicle → Session → RawMeasurement)
    and then CLUSTER_SIZE narrow CleanedMeasurement rows on _TEST_DATE.
    Cleans up everything in reverse order after the test completes.
    """
    sensor = Sensor(description="CI test sensor")
    db.add(sensor)

    vehicle = Vehicle(vehicle_name="CI test vehicle", width=200.0)
    db.add(vehicle)

    db.flush()  # populate sensor.id and vehicle.id

    session = Session(sensor_id=sensor.id, vehicle_id=vehicle.id)
    db.add(session)
    db.flush()  # populate session.id

    batch = Batch(session_id=session.id, status="completed")
    db.add(batch)
    db.flush()  # populate batch.id

    raw_records = []
    for i in range(_CLUSTER_SIZE):
        lat = _BASE_LAT + i * 0.000001
        lon = _BASE_LON + i * 0.000001
        raw = RawMeasurement(
            batch_id=batch.id,
            measured_at=_TEST_DATETIME,
            latitude=lat,
            longitude=lon,
            distance_left=100.0,
            distance_right=100.0,
        )
        db.add(raw)
        raw_records.append(raw)

    db.flush()  # populate raw.id for each RawMeasurement

    cleaned_records = []
    for i, raw in enumerate(raw_records):
        lat = _BASE_LAT + i * 0.000001   # ~0.11 m spacing — all within 5 m epsilon
        lon = _BASE_LON + i * 0.000001
        rec = CleanedMeasurement(
            raw_measurement_id=raw.id,
            cleaned_width=150.0,           # below 200 cm threshold → severity=critical
            quality_score=0.9,
            geom=WKTElement(f"POINT({lon} {lat})", srid=4326),
            created_at=_TEST_DATETIME,
        )
        db.add(rec)
        cleaned_records.append(rec)

    # Insert the pre-computed cluster that the endpoint now reads from.
    # width=150 cm → avg/min/max = 1.5 m → severity=critical
    cluster = Cluster(
        stat_date=_TEST_DATE,
        severity="critical",
        cluster_size=_CLUSTER_SIZE,
        avg_width=1.5,
        min_width=1.5,
        max_width=1.5,
        geom=WKTElement(f"POINT({_BASE_LON} {_BASE_LAT})", srid=4326),
    )
    db.add(cluster)
    db.commit()

    yield

    db.delete(cluster)
    # ON DELETE CASCADE propagates: sensor/vehicle → session → batches → raw_measurements → cleaned_measurements
    db.delete(sensor)
    db.delete(vehicle)
    db.commit()


def test_dbscan_detects_exactly_one_obstacle_cluster(client, obstacle_measurements):
    """
    A pre-computed cluster on _TEST_DATE must be returned by the obstacles
    endpoint with severity=critical and the correct cluster size.
    """
    response = client.get(
        "/api/analytics/obstacles",
        params={"target_date": str(_TEST_DATE)},
    )

    assert response.status_code == 200
    features = response.json()["features"]
    assert len(features) == 1
    props = features[0]["properties"]
    assert props["severity"] == "critical"
    assert props["cluster_size"] == _CLUSTER_SIZE


# ---------------------------------------------------------------------------
# 4. Road segments in bbox — core map endpoint
# ---------------------------------------------------------------------------

# Bounding box covering central Plzeň — the golden DB contains OSM segments here.
_PLZEN_BBOX = {
    "min_lat": 49.74,
    "min_lon": 13.37,
    "max_lat": 49.76,
    "max_lon": 13.39,
}

# Bounding box in the middle of the Atlantic Ocean — no road segments expected.
_OCEAN_BBOX = {
    "min_lat": -1.0,
    "min_lon": -1.0,
    "max_lat": 1.0,
    "max_lon": 1.0,
}


def test_bbox_returns_geojson_feature_collection(client):
    """
    GET /api/maps/bbox with a bbox covering central Plzeň must return a valid
    GeoJSON FeatureCollection with at least one road segment, each having the
    expected structure (id, geometry, properties with avg_width and name).
    """
    response = client.get("/api/maps/bbox", params=_PLZEN_BBOX)

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    features = body["features"]
    assert len(features) > 0

    first = features[0]
    assert "id" in first
    assert first["type"] == "Feature"
    assert "geometry" in first
    props = first["properties"]
    assert "name" in props
    assert "avg_width" in props


def test_bbox_outside_road_network_returns_empty_features(client):
    """
    GET /api/maps/bbox with a bbox in the open ocean must return HTTP 200
    with an empty features list — absence of data is not an error.
    """
    response = client.get("/api/maps/bbox", params=_OCEAN_BBOX)

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert body["features"] == []


# ---------------------------------------------------------------------------
# 5. Route calculation — pgRouting / Dijkstra
# ---------------------------------------------------------------------------

# Two real locations in central Plzeň that lie on the seeded road network.
_ROUTE_START = {"lat": 49.7477, "lon": 13.3777}  # near náměstí Republiky
_ROUTE_END = {"lat": 49.7520, "lon": 13.3850}    # Lochotín direction


def test_route_between_two_plzen_points_returns_ok(client):
    """
    POST /api/routing/route with two distinct points on the Plzeň road network
    must return status "ok", a non-empty GeoJSON route, and a positive total
    distance. This also implicitly verifies that the pgRouting topology built
    from OSM data is intact.
    """
    response = client.post(
        "/api/routing/route",
        json={
            "start_lat": _ROUTE_START["lat"],
            "start_lon": _ROUTE_START["lon"],
            "end_lat": _ROUTE_END["lat"],
            "end_lon": _ROUTE_END["lon"],
            "vehicle_width_cm": 200.0,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert len(body["route"]["features"]) > 0
    assert body["total_distance_m"] > 0


def test_route_with_same_start_and_end_returns_no_route(client):
    """
    POST /api/routing/route with identical start and end coordinates must
    return HTTP 200 with status "no_route" — not an error, just an explicit
    signal that the points are at the same location.
    """
    response = client.post(
        "/api/routing/route",
        json={
            "start_lat": _ROUTE_START["lat"],
            "start_lon": _ROUTE_START["lon"],
            "end_lat": _ROUTE_START["lat"],
            "end_lon": _ROUTE_START["lon"],
            "vehicle_width_cm": 200.0,
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "no_route"


def test_route_outside_road_network_returns_404(client):
    """
    POST /api/routing/route with coordinates in the open ocean (no road network
    nearby) must return HTTP 404, confirming the application explicitly detects
    and communicates this situation to the caller.
    """
    response = client.post(
        "/api/routing/route",
        json={
            "start_lat": 0.0,
            "start_lon": 0.0,
            "end_lat": 1.0,
            "end_lon": 1.0,
            "vehicle_width_cm": 200.0,
        },
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 6. Obstacle bbox filtering
# ---------------------------------------------------------------------------

def test_obstacles_bbox_containing_cluster_returns_one_result(client, obstacle_measurements):
    """
    GET /api/analytics/obstacles with a bbox that contains the pre-computed
    test cluster must return exactly one feature with the correct attributes.
    """
    # Tight bbox around the cluster centroid (_BASE_LAT, _BASE_LON)
    response = client.get(
        "/api/analytics/obstacles",
        params={
            "target_date": str(_TEST_DATE),
            "min_lon": _BASE_LON - 0.01,
            "min_lat": _BASE_LAT - 0.01,
            "max_lon": _BASE_LON + 0.01,
            "max_lat": _BASE_LAT + 0.01,
        },
    )

    assert response.status_code == 200
    features = response.json()["features"]
    assert len(features) == 1
    props = features[0]["properties"]
    assert props["severity"] == "critical"
    assert props["cluster_size"] == _CLUSTER_SIZE


def test_obstacles_bbox_excluding_cluster_returns_empty(client, obstacle_measurements):
    """
    GET /api/analytics/obstacles with a bbox shifted far away from the test
    cluster must return an empty features list, confirming the spatial filter
    works correctly.
    """
    # Bbox far from the cluster — somewhere in the Atlantic Ocean
    response = client.get(
        "/api/analytics/obstacles",
        params={
            "target_date": str(_TEST_DATE),
            "min_lon": -10.0,
            "min_lat": -10.0,
            "max_lon": -9.0,
            "max_lat": -9.0,
        },
    )

    assert response.status_code == 200
    assert response.json()["features"] == []
