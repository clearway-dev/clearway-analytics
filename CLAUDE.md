# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClearWay Analytics is a full-stack GIS application for road passability analysis (Master's Thesis). It collects sensor measurements of road widths, spatially joins them to OSM road segments, and visualizes passability on an interactive map.

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
python calculate_stats.py         # Recalculate daily segment statistics
python scripts/seed_obstacle.py   # Generate test obstacle data
python scripts/test_mcp_client.py # Test MCP tools
```

No backend test framework is configured — testing is done via the scripts above.

## Architecture

### Data Flow

```
RawMeasurement → CleanedMeasurement → SegmentStatistics → API → Frontend
     ↑                                       ↑
 Sensor data                       calculate_stats.py (spatial join)
```

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app, all route definitions, CORS config
- **`models.py`** — SQLAlchemy ORM: `Sensor`, `Vehicle`, `Session`, `RawMeasurement`, `RoadSegment`, `CleanedMeasurement`, `SegmentStatistics`
- **`database.py`** — DB connection/session
- **`services/analytics_service.py`** — Spatial join: measurements → road segments, daily stats
- **`services/dashboard_service.py`** — KPI aggregations for admin dashboard
- **`services/ml_service.py`** — DBSCAN obstacle detection (5m radius, min 5 samples)
- **`services/osm_service.py`** — OpenStreetMap integration
- **`mcp/server.py`** — FastMCP server; exposes `list_tables`, `run_read_only_sql`, `get_daily_analytics`, `get_road_features_in_bbox` — SQL tool is restricted to SELECT only

### Frontend (`frontend/src/`)

- **`App.tsx`** — Router: `/` → MapPage, `/admin` → AdminPage
- **`pages/MapPage.tsx`** — Main interface: interactive map + search + date/width filters
- **`pages/AdminPage.tsx`** — Dashboard: KPIs, coverage heatmap, anomaly list
- **`components/MapComponent.tsx`** — Leaflet map, colors segments by passability
- **`components/FloatingPanel.tsx`** — Search, date picker, vehicle width slider
- **`components/BottomSheet.tsx`** — Segment detail + width histogram on click
- **`services/api.ts`** — All API calls (single source of truth for endpoints)

### Key Business Logic

- **Passability threshold**: 3.0 m average width — segments below this are critical
- **Obstacle detection**: DBSCAN clustering on CleanedMeasurements with narrow readings; haversine distance metric
- **CRS**: EPSG:4326 stored in DB, EPSG:3857 used for metric spatial operations
- **API responses**: GeoJSON with `[lon, lat]` ordering (Leaflet expects `[lat, lon]` — conversion happens in frontend)

### Infrastructure

- **Docker Compose** (`docker-compose.yml`) — local dev with hot reload (src/ and app/ mounted)
- **Docker Compose Prod** (`docker-compose.prod.yml`) — Traefik reverse proxy, GHCR images
- **CI/CD** (`.github/workflows/deploy.yml`) — builds and pushes images on push to `main`, deploys to Hetzner via SSH
- **Production URLs**: `clearway.zephyron.tech` (frontend), `api.clearway.zephyron.tech` (API + MCP)

### Environment

Copy `.env.example` to `.env`. Key variables:
```
DB_HOST=host.docker.internal   # Docker → host PostgreSQL (clearway-infra repo)
VITE_API_URL=http://localhost:8000
```

The database is managed in a separate `clearway-infra` repository (PostGIS on port 5432).
