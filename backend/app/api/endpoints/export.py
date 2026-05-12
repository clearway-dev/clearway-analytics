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
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.database import get_db
from app.services.export_service import ExportService
from app.api.deps import get_current_active_user

router = APIRouter()


@router.get("/preview", dependencies=[Depends(get_current_active_user)])
async def export_preview(
    mode: str = "single",
    target_date: Optional[date] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Returns segment count and date coverage for the given export configuration."""
    return ExportService(db).get_preview(mode, target_date, from_date, to_date)


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
    Modes: single | range | all
    """
    if format not in ("geojson", "shapefile", "csv"):
        raise HTTPException(status_code=400, detail="format must be one of: geojson, shapefile, csv")
    if mode not in ("single", "range", "all"):
        raise HTTPException(status_code=400, detail="mode must be one of: single, range, all")

    rows_data, filename_suffix = ExportService(db).get_export_data(mode, target_date, from_date, to_date)

    if not rows_data:
        raise HTTPException(status_code=404, detail="No data found for the selected criteria")

    filename_base = f"clearway_segments_{filename_suffix}"

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
