# clearway-analytics

Visualization and analytics layer for **ClearWay**.
This repository contains the Web Application (Frontend) and the Analytics API (Backend).

It provides dashboards, statistics, and interactive maps to evaluate road passability data, including integration with GIS systems. This project is part of a Master's Thesis.

## 🏗 Architecture & Tech Stack

The project follows a component-based architecture:

- **Frontend:** [React](https://react.dev/) + [Vite](https://vitejs.dev/) (TypeScript)
  - _Maps:_ Leaflet (via `react-leaflet`)
  - _Charts:_ Recharts
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12)
  - _Data Processing:_ GeoPandas, Shapely
  - _Database ORM:_ SQLAlchemy + GeoAlchemy2
- **Infrastructure:** Docker & Docker Compose

## 📂 Project Structure

```text
clearway-analytics/
├── backend/            # FastAPI application (Analytics API)
├── frontend/           # React application (Web Dashboard)
├── docker-compose.yml  # Orchestration for local development
├── .env.example        # Template for environment variables
└── README.md
```

## 🚀 Getting Started

### Prerequisites

1. **Docker & Docker Compose** installed.
2. **Running Database:** The database is hosted in the `clearway-infra` repository. Ensure the `clearway-infra` containers are running before starting this project.

### Installation & Run

1. **Clone the repository:**

    ```bash
    git clone [https://github.com/clearway-dev/clearway-analytics.git](https://github.com/clearway-dev/clearway-analytics.git)
    cd clearway-analytics
    ```

2. **Configure Environment Variables:**
    Copy the example configuration file to `.env`.

    ```bash
    cp .env.example .env
    ```

    _Note: The default values in `.env.example` are configured to work with the standard `clearway-infra` setup._

3. **Start the Application:**
    Run the following command to build and start both Backend and Frontend containers:

    ```bash
    docker-compose up --build
    ```

## 🌐 Access Points

Once the containers are running, you can access the services at:

- **Web Dashboard:** [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000)
- **API Documentation (Swagger UI):** [http://localhost:8000/docs](https://www.google.com/search?q=http://localhost:8000/docs)
- **API Health Check:** [http://localhost:8000/api/status](https://www.google.com/search?q=http://localhost:8000/api/status)

## 🛠 Development

- **Frontend:** The `src` folder is mounted into the container. Changes in React components will trigger **Hot Module Replacement (HMR)** automatically.
- **Backend:** The `app` folder is mounted. Changes in Python files will trigger a **server reload**.

## 🔐 Security Note

- Never commit the `.env` file.
- The `.env` file is included in `.gitignore`.
