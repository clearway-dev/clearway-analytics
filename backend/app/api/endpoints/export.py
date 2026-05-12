import io
import json
import os
import tempfile
import zipfile

import geopandas as gpd
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from shapely.geometry import shape
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.database import get_db
from app.models import RoadSegment, SegmentStatistics
from app.api.deps import get_current_active_user
from app.core.constants import PASSABILITY_THRESHOLD_M

router = APIRouter()


def _build_export_rows(results, mode: str):
    """Convert raw DB rows into a list of dicts ready for any export format."""
    rows = []
    for row in results:
        avg = round(float(row.avg_width), 2) if row.avg_width is not None else None
        rows.append({
            "segment_id": str(row.id),
            "osm_id": row.osm_id,
            "name": row.name if row.name and row.name != "nan" else None,
            "road_type": row.road_type,
            "avg_width": avg,
            "min_width": row.min_width,
            "max_width": row.max_width,
            "measurements_count": int(row.measurements_count) if row.measurements_count else 0,
            "status": "ok" if (avg or 0) >= PASSABILITY_THRESHOLD_M else "narrow",
            "date_from": str(row.date_from),
            "date_to": str(row.date_to),
            "geometry": row.geometry,
        })
    return rows


@router.get("/preview", dependencies=[Depends(get_current_active_user)])
async def export_preview(
    mode: str = "single",
    target_date: Optional[date] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Returns segment count and date coverage for the given export configuration.
    Used to show a live preview on the export page before downloading.
    """
    if mode == "single":
        target = target_date or date.today()
        count = db.query(func.count(SegmentStatistics.id)).filter(
            SegmentStatistics.stat_date == target
        ).scalar()
        return {
            "segment_count": count or 0,
            "date_from": str(target),
            "date_to": str(target),
            "days_with_data": 1 if (count or 0) > 0 else 0,
        }

    q = db.query(
        func.count(func.distinct(SegmentStatistics.segment_id)).label("segment_count"),
        func.min(SegmentStatistics.stat_date).label("date_from"),
        func.max(SegmentStatistics.stat_date).label("date_to"),
        func.count(func.distinct(SegmentStatistics.stat_date)).label("days_with_data"),
    )
    if mode == "range":
        if from_date:
            q = q.filter(SegmentStatistics.stat_date >= from_date)
        if to_date:
            q = q.filter(SegmentStatistics.stat_date <= to_date)

    result = q.one()
    return {
        "segment_count": result.segment_count or 0,
        "date_from": str(result.date_from) if result.date_from else None,
        "date_to": str(result.date_to) if result.date_to else None,
        "days_with_data": result.days_with_data or 0,
    }


@router.get("/segments", dependencies=[Depends(get_current_active_user)])
async def export_segments(
    mode: str = "single",
    target_date: Optional[date] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    format: str = "geojson",
    db: Session = Depends(get_db),
):
    """
    Exports road segment statistics in GeoJSON, Shapefile, or CSV format.
    Modes:
      single — stats for one specific date
      range  — aggregated stats between from_date and to_date
      all    — aggregated stats across all available data
    """
    if format not in ("geojson", "shapefile", "csv"):
        raise HTTPException(status_code=400, detail="format must be one of: geojson, shapefile, csv")
    if mode not in ("single", "range", "all"):
        raise HTTPException(status_code=400, detail="mode must be one of: single, range, all")

    if mode == "single":
        target = target_date or date.today()
        results = db.query(
            RoadSegment.id,
            RoadSegment.osm_id,
            RoadSegment.name,
            RoadSegment.road_type,
            SegmentStatistics.avg_width,
            SegmentStatistics.min_width,
            SegmentStatistics.max_width,
            SegmentStatistics.measurements_count,
            SegmentStatistics.stat_date.label("date_from"),
            SegmentStatistics.stat_date.label("date_to"),
            func.ST_AsGeoJSON(RoadSegment.geom).label("geometry"),
        ).join(
            SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
        ).filter(
            SegmentStatistics.stat_date == target
        ).all()
        filename_suffix = str(target)
    else:
        q = db.query(
            RoadSegment.id,
            RoadSegment.osm_id,
            RoadSegment.name,
            RoadSegment.road_type,
            (func.sum(SegmentStatistics.avg_width * SegmentStatistics.measurements_count) /
             func.nullif(func.sum(SegmentStatistics.measurements_count), 0)).label("avg_width"),
            func.min(SegmentStatistics.min_width).label("min_width"),
            func.max(SegmentStatistics.max_width).label("max_width"),
            func.sum(SegmentStatistics.measurements_count).label("measurements_count"),
            func.min(SegmentStatistics.stat_date).label("date_from"),
            func.max(SegmentStatistics.stat_date).label("date_to"),
            func.ST_AsGeoJSON(RoadSegment.geom).label("geometry"),
        ).join(
            SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
        )
        if mode == "range":
            if from_date:
                q = q.filter(SegmentStatistics.stat_date >= from_date)
            if to_date:
                q = q.filter(SegmentStatistics.stat_date <= to_date)
        results = q.group_by(
            RoadSegment.id,
            RoadSegment.osm_id,
            RoadSegment.name,
            RoadSegment.road_type,
            RoadSegment.geom,
        ).all()
        filename_suffix = f"{from_date}_to_{to_date}" if mode == "range" else "all_time"

    if not results:
        raise HTTPException(status_code=404, detail="No data found for the selected criteria")

    filename_base = f"clearway_segments_{filename_suffix}"
    rows_data = _build_export_rows(results, mode)

    if format == "geojson":
        features = [
            {
                "type": "Feature",
                "geometry": json.loads(r["geometry"]),
                "properties": {k: v for k, v in r.items() if k != "geometry"},
            }
            for r in rows_data
        ]
        content = json.dumps({"type": "FeatureCollection", "features": features})
        return Response(
            content=content,
            media_type="application/geo+json",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.geojson"'},
        )

    if format == "csv":
        csv_rows = [{k: v for k, v in r.items() if k != "geometry"} for r in rows_data]
        content = pd.DataFrame(csv_rows).to_csv(index=False)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.csv"'},
        )

    # shapefile
    shp_rows = [
        {
            "segment_id": r["segment_id"],
            "osm_id": r["osm_id"],
            "name": r["name"],
            "road_type": r["road_type"],
            "avg_width": r["avg_width"],
            "min_width": r["min_width"],
            "max_width": r["max_width"],
            "meas_count": r["measurements_count"],  # 10-char DBF field name limit
            "status": r["status"],
            "date_from": r["date_from"],
            "date_to": r["date_to"],
        }
        for r in rows_data
    ]
    geometries = [shape(json.loads(r["geometry"])) for r in rows_data]
    gdf = gpd.GeoDataFrame(shp_rows, geometry=geometries, crs="EPSG:4326")

    with tempfile.TemporaryDirectory() as tmpdir:
        shp_path = os.path.join(tmpdir, "clearway_segments.shp")
        gdf.to_file(shp_path, driver="ESRI Shapefile")

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
                fpath = os.path.join(tmpdir, f"clearway_segments{ext}")
                if os.path.exists(fpath):
                    zf.write(fpath, f"clearway_segments{ext}")
        zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.zip"'},
    )
