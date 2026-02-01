# Run with: fastmcp run app/mcp/server.py:mcp --transport sse --port 8001

import sys
import os

# Add the backend directory to sys.path to allow imports from 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastmcp import FastMCP
from sqlalchemy import inspect, text, func
from sqlalchemy.exc import IntegrityError
from app.database import engine, SessionLocal
from app.services.analytics_service import AnalyticsService
from app.models import SegmentStatistics
from datetime import datetime, date
import json

# Initialize FastMCP application
mcp = FastMCP("ClearWay Context")

@mcp.tool()
def list_tables() -> list[str]:
    """
    Returns a list of all tables in the database.
    Useful for understanding the database structure.
    """
    inspector = inspect(engine)
    return inspector.get_table_names()

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

@mcp.tool()
def run_read_only_sql(query: str) -> list[dict]:
    """
    Executes a read-only SQL query against the database.
    
    Args:
        query: The SQL query string. Must start with SELECT.
               Cannot contain modification commands (DROP, DELETE, INSERT, UPDATE, TRUNCATE).
               
    Returns:
        A list of dictionaries representing the rows returned by the query.
    """
    query_str = query.strip()
    
    # Security checks
    if not query_str.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed.")
    
    forbidden_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE"]
    if any(keyword in query_str.upper() for keyword in forbidden_keywords):
        raise ValueError("Forbidden SQL keyword detected. Only read-only queries are allowed.")
    
    with SessionLocal() as db:
        try:
            result = db.execute(text(query_str)).mappings().all()
            # Convert to list of dicts and handle serialization logic if needed manually, 
            # or rely on FastMCP's serialization. 
            # We explicitly convert to dicts with stringified dates to ensure compatibility.
            output = []
            for row in result:
                row_dict = dict(row)
                # JSON serialization check/conversion for common non-serializable types
                for key, value in row_dict.items():
                    if isinstance(value, (datetime, date)):
                        row_dict[key] = value.isoformat()
                output.append(row_dict)
            return output
        except Exception as e:
            return [{"error": str(e)}]

@mcp.tool()
def get_daily_analytics(target_date: str) -> dict:
    """
    Calculates and retrieves daily statistics for a given date.
    
    Args:
        target_date: Date string in YYYY-MM-DD format.
        
    Returns:
        A summary dictionary containing the processing results.
    """
    try:
        target_date_obj = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return {"error": "Invalid date format. Please use YYYY-MM-DD."}

    with SessionLocal() as db:
        status_message = "Success"
        service = AnalyticsService(db)
        
        try:
            # Calculate stats (logic from AnalyticsService)
            service.calculate_daily_stats(target_date_obj)
        except IntegrityError:
            db.rollback()
            status_message = "Data already exists for this date. Returning existing stats."
        except Exception as e:
            db.rollback()
            return {"error": f"An unexpected error occurred: {str(e)}"}
        
        # Query the results to return a summary
        stats = db.query(
            func.count(SegmentStatistics.id).label("total_segments"),
            func.avg(SegmentStatistics.avg_width).label("average_width"),
            func.sum(SegmentStatistics.measurements_count).label("total_measurements")
        ).filter(SegmentStatistics.stat_date == target_date_obj).first()
        
        return {
            "status": status_message,
            "date": target_date,
            "data": {
                "processed_segments": stats.total_segments if stats else 0,
                "average_network_width": round(float(stats.average_width), 2) if stats and stats.average_width else None,
                "total_measurements_processed": int(stats.total_measurements) if stats and stats.total_measurements else 0
            }
        }
