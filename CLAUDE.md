# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClearWay Analytics is a full-stack GIS application for road passability analysis (Master's Thesis). It collects sensor measurements of road widths, spatially joins them to OSM road segments, and visualizes passability on an interactive map. **Scope:** analytics, visualization, routing, and vehicle/station management. Sensor ingestion is handled by a separate colleague's system and is out of scope here.

## Commands

### Local Development (Docker)

```bash
docker-compose up --build        # Start all services (recommended)
```

Services:
- Frontend: http://localhost:5173
- API + docs: http://localhost:8000 / http://localhost:8000/docs
- MCP server: http://localhost:8001

### Frontend (`frontend/`)

```bash
npm run dev      # Vite dev server
npm run build    # TypeScript check + production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

### Backend (`backend/`)

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fastmcp run app/mcp/server.py:mcp --transport sse --port 8001

# Data scripts (run from backend/)
python seed_roads.py              # Seed OSM road segments
python seed_stations.py           # Seed emergency stations
python setup_routing.py           # Build pgRouting topology on road network
python calculate_stats.py         # Recalculate daily segment statistics
python scripts/seed_obstacle.py   # Generate test obstacle data
python scripts/test_mcp_client.py # Test MCP tools
```

No backend test framework is configured — testing is done via the scripts above.

### MCP Server (Claude Code integration)

Add to Claude Code settings to connect the MCP server:

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

For local development use `http://localhost:8001/sse`.

## Architecture

### Data Flow

```
RawMeasurement → CleanedMeasurement → SegmentStatistics → API → Frontend
     ↑                                       ↑
 Sensor data                       calculate_stats.py (spatial join)
(colleague's system)
```

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app, all route definitions, CORS config (allows localhost:5173 and production origins)
- **`models.py`** — SQLAlchemy ORM: `Sensor`, `Vehicle`, `Session`, `RawMeasurement`, `RoadSegment`, `CleanedMeasurement`, `SegmentStatistics`, `Station`, `TargetVehicle`
- **`database.py`** — DB connection/session
- **`services/analytics_service.py`** — Spatial join: measurements → road segments, daily stats
- **`services/dashboard_service.py`** — KPI aggregations for admin dashboard
- **`services/ml_service.py`** — DBSCAN obstacle detection (5m radius, min 5 samples)
- **`services/osm_service.py`** — OpenStreetMap / Nominatim integration
- **`mcp/server.py`** — FastMCP server; exposes 5 tools:
  - `list_tables` — list all DB tables
  - `run_read_only_sql` — execute SELECT queries (restricted to SELECT only)
  - `get_daily_analytics` — compute daily stats for a given date
  - `get_road_features_in_bbox` — road segments within a bounding box (GeoJSON)
  - `create_vehicle` — insert a new target vehicle into `target_vehicles`

### Key API Endpoints

- `GET /api/segments` — road segments with passability stats (GeoJSON)
- `GET /api/segments/{id}` — single segment detail + width histogram
- `GET /api/vehicles` / `POST /api/vehicles` — list / create target vehicles
- `GET /api/stations` / `POST /api/stations` — list / create emergency stations
- `GET /api/route` — pgRouting shortest path between two coordinates
- `GET /api/obstacles` — clustered obstacle points (DBSCAN output)
- `GET /api/dashboard` — KPI summary for admin dashboard

### Frontend (`frontend/src/`)

- **`App.tsx`** — Router: `/` → MapPage, `/admin` → AdminPage, `/vehicles` → VehiclesPage, `/stations` → StationsPage
- **`pages/MapPage.tsx`** — Main interface: interactive map + search + date/width filters + routing
- **`pages/AdminPage.tsx`** — Dashboard: KPIs, coverage heatmap, anomaly list
- **`pages/VehiclesPage.tsx`** — Target vehicle CRUD
- **`pages/StationsPage.tsx`** — Emergency station management
- **`components/MapComponent.tsx`** — Leaflet map, colors segments by passability
- **`components/FloatingPanel.tsx`** — Search (Nominatim), date picker, vehicle width slider
- **`components/BottomSheet.tsx`** — Segment detail + width histogram on click
- **`services/api.ts`** — All API calls (single source of truth for endpoints)

### Key Business Logic

- **Passability threshold**: 3.0 m average width — segments below this are critical
- **Obstacle detection**: DBSCAN clustering on CleanedMeasurements with narrow readings; haversine distance metric
- **Routing**: pgRouting `pgr_dijkstra` on road network topology built from OSM segments
- **CRS**: EPSG:4326 stored in DB, EPSG:3857 used for metric spatial operations
- **API responses**: GeoJSON with `[lon, lat]` ordering (Leaflet expects `[lat, lon]` — conversion happens in frontend)

### Infrastructure

- **Docker Compose** (`docker-compose.yml`) — local dev with hot reload (src/ and app/ mounted)
- **Docker Compose Prod** (`docker-compose.prod.yml`) — Traefik reverse proxy, GHCR images
- **CI/CD** (`.github/workflows/deploy.yml`) — builds and pushes images on push to `main`, deploys to Hetzner via SSH
- **Production URLs**: `clearway.zephyron.tech` (frontend), `api.clearway.zephyron.tech` (API + MCP)

### Database Migrations

Migrations live in `clearway-infra/db/migrations/` as `V001__*.sql`, `V002__*.sql`, etc. They are currently applied manually. Convention: always prefix with `V00N__` (zero-padded) and describe the change in the filename.

### Environment

Copy `.env.example` to `.env`. Key variables:
```
DB_HOST=host.docker.internal   # Docker → host PostgreSQL (clearway-infra repo)
VITE_API_URL=http://localhost:8000
```

The database is managed in a separate `clearway-infra` repository (PostGIS + pgRouting on port 5432).

---

## Development Roadmap

Thesis scope: analytics and visualization. Sensor ingestion is a separate colleague's responsibility.

### Priority 1 — GIS Export (thesis deliverable)

The main analytical output needs to be exportable in standard GIS formats for QGIS, ArcGIS, and academic reporting.

**Backend** — new endpoint `GET /api/export/segments`:
- Query params: `target_date`, `format` (`geojson` | `shapefile` | `csv`)
- GeoJSON: FeatureCollection download (`.geojson` file attachment)
- Shapefile: GeoPandas + Fiona → `.zip` of `.shp/.dbf/.shx/.prj`
- CSV: `segment_id`, `name`, `avg_width`, `min_width`, `max_width`, `measurements_count`, `status`, `date`

**Frontend** — Export button in AdminPage:
- Dropdown: GeoJSON / Shapefile / CSV
- Date selector (defaults to currently viewed date)
- Download triggers directly (no intermediate UI)

### Priority 2 — Auth / API Security

Currently any anonymous user can create/update/delete vehicles, stations, and routes.

**Approach** — single static API key in `.env` (`API_KEY`), sent as `X-API-Key` header:
- FastAPI dependency `verify_api_key` applied to all write (POST/PUT/DELETE) endpoints
- Read-only GET endpoints remain public
- Frontend reads key from `VITE_API_KEY` env var and includes it on all write calls
- Return `401` if missing or wrong

### Priority 3 — Automatic DB Migrations

Current system: `V00N__*.sql` files in `clearway-infra/db/migrations/` applied manually. Risk: prod drifts from schema silently.

**Approach** — entrypoint shell script in `clearway-infra/db/`:
- On container start, scan `/migrations/*.sql` sorted by filename
- Track applied migrations in `schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)`
- Apply any not yet recorded using `psql`
- Pure bash + psql, no Flyway/Alembic dependency

### Priority 4 — Code Quality (ongoing)

- Ensure all frontend API calls go through `services/api.ts` (no ad-hoc `fetch`/`axios` in components)
- Replace `print()` with Python `logging` in backend services
- Shared TypeScript types across pages (avoid per-component inline type redeclarations)
