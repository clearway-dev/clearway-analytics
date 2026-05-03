# ClearWay Analytics

Visualisation and analytics layer of the **ClearWay** system — a web application for road passability analysis.

The system collects sensor-based road width measurements, spatially joins them to OSM segments, and visualises passability on an interactive map. It includes an admin dashboard, vehicle and emergency station management, route planning, and GIS data export.

This project is developed as part of a Master's Thesis.

---

## Architecture

```
clearway-analytics/
├── backend/                    # FastAPI (Python 3.12) — Analytics API + MCP server
├── frontend/                   # React 19 + Vite (TypeScript) — web application
├── docker-compose.yml          # Local development orchestration
├── docker-compose.prod.yml     # Production (Traefik + GHCR images)
└── .env.example                # Environment variable template
```

### Data Flow

```
RawMeasurement → CleanedMeasurement → SegmentStatistics → API → Frontend
      ↑                                        ↑
  Sensor data                        calculate_stats.py
 (colleague's system)                (spatial join)
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, Leaflet, Recharts, Tailwind |
| Backend | FastAPI, SQLAlchemy + GeoAlchemy2, GeoPandas, scikit-learn |
| Database | PostgreSQL + PostGIS + pgRouting (repo `clearway-infra`) |
| AI/MCP | FastMCP (Model Context Protocol), Google Gemini |
| Infrastructure | Docker Compose, Traefik, GitHub Actions, Hetzner VPS |

---

## Features

### User Features
- **Interactive passability map** — road segments coloured by average measured width (≥ 3.0 m green / < 3.0 m red)
- **Filters** — historical snapshots by date, filtering by vehicle width
- **Obstacle detection** — DBSCAN clustering of narrow measurements displayed as a point layer
- **Route planning** — pgRouting shortest path with passability awareness
- **Emergency station management** — map overlay of fire/rescue stations with map-based location picking
- **Vehicle management** — CRUD for target emergency vehicles, including AI import from PDF/TXT documents
- **Data export** — GeoJSON, Shapefile (.zip), CSV for QGIS/ArcGIS

### Admin Features
- **Dashboard** — KPI cards (total segments, coverage, critical segments, measurements)
- **Coverage heatmap** — measurement density visualisation
- **User management** — admin / dispatcher roles

### Developer / AI Features
- **MCP server** — 15+ tools for AI agents (Claude): DB queries, analytics, vehicle management, route planning

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Running database from the `clearway-infra` repository

### Local Development

```bash
# 1. Clone and configure environment variables
cp .env.example .env

# 2. Start all services
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Web application | http://localhost:5173 |
| API documentation (Swagger) | http://localhost:8000/docs |
| API health check | http://localhost:8000/api/status |
| MCP server (SSE) | http://localhost:8001 |

### Production

| Service | URL |
|---------|-----|
| Web application | https://clearway.zephyron.tech |
| API + MCP | https://api.clearway.zephyron.tech |

---

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

```bash
# Database (clearway-infra)
DB_USER=clearway
DB_PASSWORD=change_me
DB_HOST=host.docker.internal   # Docker → host PostgreSQL
DB_PORT=5432
DB_NAME=clearway

# Frontend
VITE_API_URL=http://localhost:8000

# Authentication
SECRET_KEY=change-me-in-production

# AI (Gemini — for vehicle import from documents)
GOOGLE_API_KEY=AI...
```

> `.env` is in `.gitignore` — never commit it.

---

## Connecting to the Production Database Locally

Port 5432 is not exposed externally on the VPS. Connect via SSH tunnel:

```bash
# Terminal 1 — keep running
ssh -L 5433:172.20.0.2:5432 vandl@77.42.45.121 -N

# Terminal 2 — backend with production DB
export DATABASE_URL="postgresql://clearway:clearway_dev_password@127.0.0.1:5433/clearway_db"
export SECRET_KEY=local-dev-secret
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Note: use `127.0.0.1`, not `localhost` — psycopg2 otherwise connects over IPv6.

---

## CI/CD

Pushing to the `main` branch triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. Builds Docker images for backend and frontend
2. Pushes images to GitHub Container Registry (GHCR)
3. Deploys to Hetzner VPS via SSH (`docker compose pull && docker compose up -d`)

Pull requests and pushes to `dev` trigger `.github/workflows/dev-ci.yml`:
- ruff lint (backend)
- ESLint + TypeScript type-check (frontend)
- Dry-run Docker build
- pytest (backend)

---

## Development Without Docker

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql://clearway:clearway_dev_password@127.0.0.1:5432/clearway_db"
export SECRET_KEY=local-dev-secret
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # TypeScript check + production build
npm run lint         # ESLint
```

### MCP Server

```bash
cd backend
fastmcp run app/mcp/server.py:mcp --transport sse --port 8001
```

---

## Data Scripts

Run from the `backend/` directory:

```bash
python calculate_stats.py          # Recalculate daily segment statistics
python calculate_clusters.py       # Recalculate DBSCAN obstacle clusters
python scripts/seed_stations.py    # Seed emergency stations
python scripts/seed_users.py       # Seed users
python scripts/seed_obstacle.py    # Generate test obstacle data
python scripts/test_mcp_client.py  # Test MCP tools
```

Road network seeding and pgRouting topology setup are in the `clearway-infra` repository (`make seed-roads`, `make setup-routing`).

---

## MCP Integration (Claude Code)

Add to Claude Code settings to connect to the production MCP server:

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

---

## Database Migrations

Migrations are located in `clearway-infra/db/migrations/` as `V001__*.sql`, `V002__*.sql`, ... and are applied manually. Convention: always use the `V00N__` prefix (zero-padded) with a descriptive name in the filename.
