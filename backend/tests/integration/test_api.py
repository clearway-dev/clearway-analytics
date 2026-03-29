"""
Integration tests for the ClearWay Analytics API.
All tests run against the live golden database image (pre-seeded Plzeň road network).
"""
from datetime import date, datetime

import pytest
from geoalchemy2 import WKTElement

from app.models import Batch, CleanedMeasurement, Sensor, Vehicle, Session, RawMeasurement


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

# MLService.detect_obstacles has an early-exit guard: len(results) < 10 → return [].
# With 10 points and MIN_SAMPLES=5, DBSCAN produces exactly one cluster.
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

    db.commit()

    yield

    # ON DELETE CASCADE propagates: sensor/vehicle → session → batches → raw_measurements → cleaned_measurements
    db.delete(sensor)
    db.delete(vehicle)
    db.commit()


def test_dbscan_detects_exactly_one_obstacle_cluster(client, obstacle_measurements):
    """
    10 narrow measurements clustered within 1 m on _TEST_DATE must produce
    exactly one obstacle with severity=critical and the correct cluster size.
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
