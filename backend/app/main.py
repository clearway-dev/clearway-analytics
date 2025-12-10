from sqlalchemy import select
from app.database import get_db
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Initialize the FastAPI application with metadata
app = FastAPI(
    title="ClearWay Analytics API",
    description="Backend service for analyzing and visualizing road passability data.",
    version="1.0.0"
)

# --------------------------------------------------------------------------
# CORS CONFIGURATION
# --------------------------------------------------------------------------
# Allow the frontend (React running on port 3000) to communicate with this API.
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------------------------------------------------

@app.get("/")
async def root():
    """
    Root endpoint to verify the service is running.
    """
    return {
        "system": "ClearWay Analytics",
        "status": "online",
        "version": "1.0.0"
    }

@app.get("/api/status")
async def get_status(db: Session = Depends(get_db)):
    """
    Health check endpoint that verifies real database connectivity.
    Uses 'select(1)' to ensure the DB is reachable and can execute queries.
    """
    try:
        # Try to execute a simple query
        result = db.scalar(select(1))

        return {
            "database": "connected", 
            "status": "operational",
            "test_query_result": result # Should be 1 
        }
    except Exception as e:
        # Log the exception 
        print(f"Database connection error: {e}")
        return {
            "database": "error", 
            "detail": str(e)
    }