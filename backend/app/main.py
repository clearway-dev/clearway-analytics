from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.endpoints import auth, maps, vehicles, routing, stations, ai, geocode
from app.api.endpoints import dashboard, export, analytics
from app.api.endpoints.segments import map_router, stats_router, roads_router

app = FastAPI(
    title="ClearWay Analytics API",
    description="Backend service for analyzing and visualizing road passability data.",
    version="1.0.0",
)

origins = [
    "http://localhost",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://clearway.zephyron.tech",
    "https://www.clearway.zephyron.tech",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/v1/auth",      tags=["auth"])
app.include_router(maps.router,      prefix="/api/v1/maps",      tags=["maps"])
app.include_router(vehicles.router,  prefix="/api/v1/vehicles",  tags=["vehicles"])
app.include_router(routing.router,   prefix="/api/v1/routing",   tags=["routing"])
app.include_router(stations.router,  prefix="/api/v1/stations",  tags=["stations"])
app.include_router(ai.router,        prefix="/api/v1/ai",        tags=["ai"])
app.include_router(geocode.router,   prefix="/api/v1/geocode",   tags=["geocode"])
app.include_router(map_router,       prefix="/api/v1/map",       tags=["map"])
app.include_router(stats_router,     prefix="/api/v1/stats",     tags=["stats"])
app.include_router(roads_router,     prefix="/api/v1/roads",     tags=["roads"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(export.router,    prefix="/api/v1/export",    tags=["export"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])


@app.get("/")
async def root():
    return {
        "system": "ClearWay Analytics",
        "status": "online",
        "version": "1.0.0",
    }


@app.get("/api/status")
async def get_status(db: Session = Depends(get_db)):
    """
    Health check endpoint that verifies real database connectivity.
    Uses 'select(1)' to ensure the DB is reachable and can execute queries.
    """
    try:
        result = db.scalar(select(1))
        return {
            "database": "connected",
            "status": "operational",
            "test_query_result": result,
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Database connection error: %s", e)
        return {"database": "error", "detail": "Database unavailable"}
