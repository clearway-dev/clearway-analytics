# ClearWay Analytics — Backend

FastAPI application providing the Analytics API and MCP server for the ClearWay system.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | FastAPI 0.100+ |
| ORM | SQLAlchemy 2.0 + GeoAlchemy2 |
| Database | PostgreSQL + PostGIS + pgRouting |
| GIS | GeoPandas, Shapely, Fiona |
| ML | scikit-learn (DBSCAN) |
| AI | Google Gemini API (`google-genai`) |
| Auth | JWT (python-jose + bcrypt) |
| MCP | FastMCP |
| Containerisation | Docker (python:3.12-alpine) |

---

## Directory Structure

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, core endpoints
│   ├── models.py                # SQLAlchemy ORM models
│   ├── database.py              # DB connection and session
│   ├── api/
│   │   ├── deps.py              # JWT auth dependencies
│   │   └── endpoints/
│   │       ├── auth.py          # Login, user management
│   │       ├── maps.py          # Segments in bbox
│   │       ├── vehicles.py      # Target vehicles (CRUD)
│   │       ├── stations.py      # Emergency stations (CRUD)
│   │       ├── routing.py       # pgRouting routes
│   │       ├── geocode.py       # Nominatim geocoding
│   │       └── ai.py            # AI vehicle parsing (Gemini)
│   ├── core/
│   │   ├── config.py            # Application settings (env vars)
│   │   └── security.py          # bcrypt, JWT
│   ├── services/
│   │   ├── analytics_service.py # Spatial join, daily statistics
│   │   ├── dashboard_service.py # KPI aggregations
│   │   ├── ml_service.py        # DBSCAN obstacle detection
│   │   └── ai_service.py        # Gemini AI integration
│   └── mcp/
│       └── server.py            # FastMCP server (15+ tools)
├── scripts/
│   ├── seed_stations.py         # Seed emergency stations
│   ├── seed_users.py            # Seed users
│   ├── seed_obstacle.py         # Test obstacle data
│   ├── generate_fleet_data.py   # Test vehicle data
│   └── test_mcp_client.py       # Test MCP tools
├── calculate_stats.py           # Recalculate daily segment statistics
├── calculate_clusters.py        # Recalculate DBSCAN clusters
├── requirements.txt
├── Dockerfile                   # Dev image (hot reload)
└── Dockerfile.prod              # Production image
```

---

## Running

### Docker (recommended)

```bash
# From the project root
docker-compose up --build
```

API runs at http://localhost:8000, MCP at http://localhost:8001.

### Locally Without Docker

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL="postgresql://clearway:clearway_dev_password@127.0.0.1:5432/clearway_db"
export SECRET_KEY=local-dev-secret
export DEBUG=true

# API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# MCP server (separate terminal)
fastmcp run app/mcp/server.py:mcp --transport sse --port 8001
```

---

## Database Models

### `Sensor`
Physical sensor mounted on a data-collection vehicle.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| description | String | Sensor description |
| is_active | Boolean | Active / deactivated |

### `Vehicle`
Vehicle collecting sensor data.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| vehicle_name | String(100) | Vehicle name |
| width | Integer | Width in cm |

### `Session`
A single data-collection drive.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| sensor_id | UUID | FK → Sensor |
| vehicle_id | UUID | FK → Vehicle |
| started_at | DateTime | Session start time |

### `Batch`
A batch of measurements within a session.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| session_id | UUID | FK → Session |
| status | String | Processing status |

### `RawMeasurement`
Raw measurement from the sensor.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| batch_id | UUID | FK → Batch |
| latitude / longitude | Float | GPS coordinates |
| distance_left / distance_right | Float | Distance to obstacles (cm) |
| recorded_at | DateTime | Timestamp |

### `RoadSegment`
Road segment from OpenStreetMap.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| osm_id | BigInteger | OSM segment ID |
| name | String(255) | Street name (nullable) |
| road_type | String | Road type (per OSM) |
| geom | Geometry(LINESTRING, 4326) | Segment geometry |

### `CleanedMeasurement`
Cleaned and validated measurement.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| raw_measurement_id | UUID | FK → RawMeasurement |
| cleaned_width | Float | Resulting width (cm) |
| quality_score | Float | Quality score (0–1) |
| geom | Geometry(POINT, 4326) | Measurement location |

### `SegmentStatistics`
Daily aggregated statistics for a segment.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| segment_id | UUID | FK → RoadSegment |
| stat_date | Date | Statistics date |
| avg_width | Float | Average width (cm) |
| min_width | Float | Minimum width (cm) |
| max_width | Float | Maximum width (cm) |
| measurements_count | Integer | Number of measurements |

### `Cluster`
DBSCAN obstacle cluster.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| stat_date | Date | Date |
| severity | String | Severity (low / medium / high) |
| cluster_size | Integer | Number of measurements in cluster |
| avg_width / min_width | Float | Cluster widths (cm) |
| geom | Geometry(POINT, 4326) | Cluster centroid |

### `Station`
Emergency station.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| name | String(255) | Station name |
| type | String | fire / police / hospital / rescue |
| address | String | Address |
| lat / lon | Float | GPS coordinates |

### `User`
Application user.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| email | String | Email (unique) |
| hashed_password | String | bcrypt hash |
| full_name | String(255) | Full name |
| role | String | admin / dispatcher |
| is_active | Boolean | Active account |

### `TargetVehicle`
Target emergency vehicle (used for passability filtering).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| name | String(255) | Vehicle name |
| category | String | Category (fire, ambulance, ...) |
| width / height | Integer | Dimensions in cm |
| weight | Float | Weight in tonnes |
| length | Integer | Length in cm |
| turning_diameter_track | Integer | Track turning diameter (cm) |
| turning_diameter_clearance | Integer | Turning diameter with clearance (cm) |
| stabilization_width | Integer | Width with stabilisers deployed (cm) |

---

## API Endpoints

Full interactive documentation is available via Swagger UI at `/docs`.

### Authentication (`/api/auth/`)

| Method | URL | Description | Role |
|--------|-----|-------------|------|
| POST | `/api/auth/login/access-token` | Login, returns JWT | Public |
| GET | `/api/auth/users/me` | Current user profile | Authenticated |
| GET | `/api/auth/users` | List all users | Admin |
| POST | `/api/auth/users` | Create user | Admin |
| PUT | `/api/auth/users/{id}` | Update user | Admin |
| DELETE | `/api/auth/users/{id}` | Delete user | Admin |

### Map (`/api/maps/`)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/maps/bbox` | GeoJSON FeatureCollection of segments within a bounding box |

Query parameters for `/api/maps/bbox`:
- `min_lat`, `min_lon`, `max_lat`, `max_lon` — bounding box
- `target_date` (optional) — statistics date; defaults to the latest available
- `session_id` (optional) — live computation for a specific session (bypasses pre-aggregated statistics)

### Additional Endpoints in `main.py`

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/status` | DB connectivity check |
| GET | `/api/map/segments` | Segments with statistics for a date |
| GET | `/api/stats/segment/{id}/histogram` | Width distribution (25 cm bins) |
| GET | `/api/roads/search?q=` | Full-text street search (max 10 results) |
| GET | `/api/dashboard/stats` | Global KPIs |
| GET | `/api/dashboard/coverage` | GeoJSON coverage heatmap |
| GET | `/api/dashboard/available-dates` | Available dates with measurement counts |
| GET | `/api/export/preview` | Segment count and date range for export |
| GET | `/api/export/segments` | Download export (`format`: geojson \| shapefile \| csv) |
| GET | `/api/analytics/sessions` | Data-collection sessions for a date |
| GET | `/api/analytics/obstacles` | DBSCAN obstacle clusters (GeoJSON) |

### Vehicles (`/api/vehicles/`)

| Method | URL | Description | Role |
|--------|-----|-------------|------|
| GET | `/api/vehicles` | List target vehicles | Authenticated |
| POST | `/api/vehicles` | Create vehicle | Admin |
| PUT | `/api/vehicles/{id}` | Update vehicle | Admin |
| DELETE | `/api/vehicles/{id}` | Delete vehicle | Admin |

### Stations (`/api/stations/`)

| Method | URL | Description | Role |
|--------|-----|-------------|------|
| GET | `/api/stations` | List emergency stations | Authenticated |
| POST | `/api/stations` | Create station | Admin |
| PUT | `/api/stations/{id}` | Update station | Admin |
| DELETE | `/api/stations/{id}` | Delete station | Admin |

### Routing (`/api/routing/`)

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/routing/route` | Shortest route (pgRouting) |

Request body:
```json
{
  "start_lat": 49.195,
  "start_lon": 16.608,
  "end_lat": 49.201,
  "end_lon": 16.614,
  "vehicle_width_cm": 250,
  "target_date": "2024-11-15"
}
```

### Geocoding (`/api/geocode/`)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/geocode/reverse?lat=&lon=` | Coordinates → address (Nominatim) |
| GET | `/api/geocode/forward?q=` | Address → coordinates (Nominatim) |

### AI (`/api/ai/`)

| Method | URL | Description | Role |
|--------|-----|-------------|------|
| POST | `/api/ai/parse-vehicle` | Extract vehicles from text (Gemini) | Admin |
| POST | `/api/ai/parse-vehicle-file` | Extract vehicles from PDF/TXT (Gemini) | Admin |

---

## Key Business Logic

### Spatial Join (`analytics_service.py`)
Assigning measurements to road segments:
- Snap distance (`SNAP_DISTANCE_M`): **10 m** (≈ 0.00008983°)
- SQL: `LATERAL JOIN` with `ST_DWithin` + `ORDER BY geom <-> geom LIMIT 1`
- Output: `SegmentStatistics` (avg / min / max / count per segment per day)

### Passability Threshold
- `avg_width >= 3.0 m` → **OK** (green)
- `avg_width < 3.0 m` → **narrow** (red)
- No data → **no_data** (grey)

### DBSCAN Obstacle Detection (`ml_service.py` + `calculate_clusters.py`)
- Input: `CleanedMeasurement` records with narrow width values
- Parameters: `metric='haversine'`, `eps=5/6_371_000` (5 metres in radians), `min_samples=5`
- Output: `Cluster` table (pre-computed, queried via API)

### Routing (`routing.py`)
- `pgr_withPoints` + `pgr_findCloseEdges` — snaps start/end points to the nearest edge
- Output: GeoJSON route with trimmed geometries on terminal segments, `total_distance_m`, `segment_count`

### Data Export (`main.py`)
Three modes:
- `single` — statistics for a single day
- `range` — aggregate between two dates
- `all` — all available data

Three formats:
- `geojson` — FeatureCollection with geometry
- `shapefile` — `.zip` containing `.shp/.shx/.dbf/.prj/.cpg` (GeoPandas + Fiona)
- `csv` — attributes only, no geometry

### Coordinate Systems
- DB stores data in **EPSG:4326** (WGS-84)
- Metric spatial operations use **EPSG:3857**
- API responses: GeoJSON with `[lon, lat]` ordering (WGS-84 standard)

---

## Authentication and Authorisation

JWT token (HS256, 8-hour validity):
1. `POST /api/auth/login/access-token` → JWT token
2. Frontend attaches `Authorization: Bearer <token>` to every request
3. Backend decodes the token in `deps.py` → loads user from DB

Roles:
- `dispatcher` — read access + routing
- `admin` — full access including CRUD for vehicles, stations, users, AI parsing

---

## MCP Server

FastMCP server on port 8001 (SSE transport). Designed for AI agents (Claude Code).

Connection config:
```json
{
  "mcpServers": {
    "clearway-prod": {
      "type": "sse",
      "url": "https://api.clearway.zephyron.tech/mcp/sse"
    }
  }
}
```

### Available Tools

**Schema and database:**
- `describe_schema()` — full DB schema (tables, columns, types, foreign keys)
- `run_read_only_sql(query)` — execute a SELECT query

**Analytics:**
- `get_available_dates()` — available dates with statistics
- `get_passability_stats(target_date, vehicle_width_cm)` — KPIs
- `recalculate_daily_stats(target_date, force)` — recompute statistics
- `get_segment_detail(segment_id)` — history + width histogram
- `get_temporal_trends(from_date, to_date, vehicle_width_cm)` — day-by-day trends
- `get_data_quality_report(target_date)` — quality score distribution

**Operational tools:**
- `get_vehicles()` — list of target vehicles
- `get_stations()` — list of emergency stations
- `check_vehicle_passability(vehicle_id, target_date)` — `"passable"` / `"blocked"`
- `get_obstacles(target_date, bbox)` — obstacle clusters
- `get_road_features_in_bbox(...)` — list of segments in an area (max 100)
- `find_passable_route(start_lat, start_lon, end_lat, end_lon, vehicle_width_cm, target_date)` — pgRouting route

**Management:**
- `create_vehicle(name, category, width, height, weight, ...)` — insert a new vehicle

---

## Data Scripts

Run from the `backend/` directory:

```bash
# Recalculate daily statistics (SegmentStatistics) for today
python calculate_stats.py

# Recalculate DBSCAN obstacle clusters
python calculate_clusters.py

# Seed scripts
python scripts/seed_stations.py        # Emergency stations
python scripts/seed_users.py           # Users (admin + dispatcher)
python scripts/seed_obstacle.py        # Test obstacle measurements
python scripts/generate_fleet_data.py  # Test vehicles

# Test MCP
python scripts/test_mcp_client.py
```

---

## Tests

```bash
# From the project root (requires a running DB)
cd backend && pytest
```

Tests are in `tests/` and cover key API endpoints and analytical computations.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLAlchemy connection string | assembled from DB_* vars |
| `DB_USER` | DB user | `clearway` |
| `DB_PASSWORD` | DB password | — |
| `DB_HOST` | DB host | `host.docker.internal` |
| `DB_PORT` | DB port | `5432` |
| `DB_NAME` | Database name | `clearway` |
| `SECRET_KEY` | JWT signing key | `dev-key` (change in production!) |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT validity | `480` (8 h) |
| `GOOGLE_API_KEY` | Gemini API key | — |
| `DEBUG` | Debug mode | `false` |
