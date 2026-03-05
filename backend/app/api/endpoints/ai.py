import io
from typing import List

import pdfplumber
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel

from app.api.deps import require_admin
from app.services.ai_service import parse_vehicles_from_text

router = APIRouter()


class ParseVehicleRequest(BaseModel):
    text: str


class ParsedVehicle(BaseModel):
    name: str | None = None
    category: str | None = None
    width: int | None = None
    height: int | None = None
    length: int | None = None
    turning_diameter_track: int | None = None
    turning_diameter_clearance: int | None = None
    stabilization_width: int | None = None
    weight: float | None = None


def _run_ai(text: str) -> List[ParsedVehicle]:
    if not text.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Text must not be empty.")
    try:
        vehicles = parse_vehicles_from_text(text)
        return [ParsedVehicle(**v) for v in vehicles]
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI parsing failed: {e}")


@router.post("/parse-vehicle", response_model=List[ParsedVehicle], dependencies=[Depends(require_admin)])
def parse_vehicle(body: ParseVehicleRequest):
    """Extract vehicles from plain text. Admin only."""
    return _run_ai(body.text)


@router.post("/parse-vehicle-file", response_model=List[ParsedVehicle], dependencies=[Depends(require_admin)])
async def parse_vehicle_file(file: UploadFile = File(...)):
    """Extract vehicles from an uploaded PDF or TXT file. Admin only."""
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"PDF extraction failed: {e}")
    else:
        # txt and everything else — decode as UTF-8
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")

    return _run_ai(text)
