from fastapi import FastAPI

# Initialize the FastAPI application with metadata
app = FastAPI(
    title="ClearWay Analytics API",
    description="Backend service for analyzing and visualizing road passability data.",
    version="1.0.0"
)

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
async def get_status():
    """
    Mock endpoint to check connection status from the frontend.
    Returns the database connection state and processing metrics.
    """
    # TODO: Replace with actual database connection check later
    return {
        "database": "disconnected", 
        "items_processed": 0
    }