# clearway-analytics

Visualization and analytics layer for **ClearWay**.
This repository contains the Web Application (Frontend), the Analytics API (Backend), and an MCP server for AI-assisted data access.

It provides dashboards, statistics, interactive maps, vehicle management, emergency station tracking, and route planning to evaluate road passability data, including integration with GIS systems. This project is part of a Master's Thesis.

## 🏗 Architecture & Tech Stack

The project follows a component-based architecture:

- **Frontend:** [React](https://react.dev/) + [Vite](https://vitejs.dev/) (TypeScript)
  - _Maps:_ Leaflet (via `react-leaflet`)
  - _Charts:_ Recharts
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12)
  - _Data Processing:_ GeoPandas, Shapely, scikit-learn (DBSCAN obstacle detection)
  - _Database ORM:_ SQLAlchemy + GeoAlchemy2
  - _AI / MCP:_ FastMCP (Model Context Protocol server)
- **Database:** PostGIS (managed in `clearway-infra`) + pgRouting (road network topology)
- **Infrastructure:** Docker & Docker Compose, Traefik (prod reverse proxy), GitHub Actions CI/CD

## 📂 Project Structure

```text
clearway-analytics/
├── backend/            # FastAPI application (Analytics API + MCP server)
├── frontend/           # React application (Web Dashboard)
├── docker-compose.yml      # Orchestration for local development
├── docker-compose.prod.yml # Production config (Traefik + GHCR images)
├── .env.example        # Template for environment variables
└── README.md
```

## ✨ Features

- **Interactive passability map** — road segments colored by average measured width
- **Date & vehicle-width filters** — view historical snapshots, filter by vehicle clearance
- **Obstacle detection** — DBSCAN clustering on narrow measurements, displayed as heatmap
- **Route planning** — pgRouting-powered shortest path between two points on the road network
- **Emergency stations** — map overlay of fire/rescue stations with coverage visualization
- **Vehicle management** — CRUD for target vehicles (dimensions used for passability filtering)
- **Admin dashboard** — KPIs, coverage heatmap, anomaly list
- **GIS integration** — Nominatim address search, GeoJSON API responses
- **MCP server** — AI agents can query road data, run analytics, and add vehicles via tool calls

## 🚀 Getting Started

### Prerequisites

1. **Docker & Docker Compose** installed.
2. **Running Database:** The database is hosted in the `clearway-infra` repository. Ensure the `clearway-infra` containers are running before starting this project.

### Installation & Run

1. **Clone the repository:**

    ```bash
    git clone https://github.com/clearway-dev/clearway-analytics.git
    cd clearway-analytics
    ```

2. **Configure Environment Variables:**
    Copy the example configuration file to `.env`.

    ```bash
    cp .env.example .env
    ```

    _Note: The default values in `.env.example` are configured to work with the standard `clearway-infra` setup._

3. **Start the Application:**
    Run the following command to build and start all containers:

    ```bash
    docker-compose up --build
    ```

## 🌐 Access Points

### Local Development

Once the containers are running, you can access the services at:

- **Web Dashboard:** http://localhost:5173
- **API Documentation (Swagger UI):** http://localhost:8000/docs
- **API Health Check:** http://localhost:8000/api/status
- **MCP Server (SSE):** http://localhost:8001

### Production

- **Web Dashboard:** https://clearway.zephyron.tech
- **API + MCP:** https://api.clearway.zephyron.tech

## 🔄 CI/CD

Pushes to `main` trigger a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:
1. Builds Docker images for frontend and backend
2. Pushes images to GitHub Container Registry (GHCR)
3. Deploys to a Hetzner VPS via SSH

## 🛠 Development

- **Frontend:** The `src` folder is mounted into the container. Changes in React components will trigger **Hot Module Replacement (HMR)** automatically.
- **Backend:** The `app` folder is mounted. Changes in Python files will trigger a **server reload**.

## 🔐 Security Note

- Never commit the `.env` file.
- The `.env` file is included in `.gitignore`.
