from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_admin
from app.database import get_db
from app.models import Station

router = APIRouter()

VALID_TYPES = {"fire_station", "police", "hospital", "rescue", "other"}


class StationBody(BaseModel):
    name: str
    type: Optional[str] = None
    address: Optional[str] = None
    lat: float
    lon: float
    notes: Optional[str] = None

    def model_post_init(self, __context) -> None:
        if self.type and self.type not in VALID_TYPES:
            raise ValueError(f"type must be one of: {', '.join(sorted(VALID_TYPES))}")


def _to_dict(s: Station) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "type": s.type,
        "address": s.address,
        "lat": s.lat,
        "lon": s.lon,
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


@router.get("/", response_model=list, dependencies=[Depends(get_current_active_user)])
def list_stations(db: Session = Depends(get_db)):
    stations = db.query(Station).order_by(Station.name).all()
    return [_to_dict(s) for s in stations]


@router.post("/", response_model=dict, status_code=201, dependencies=[Depends(require_admin)])
def create_station(body: StationBody, db: Session = Depends(get_db)):
    station = Station(**body.model_dump())
    db.add(station)
    db.commit()
    db.refresh(station)
    return _to_dict(station)


@router.put("/{station_id}", response_model=dict, dependencies=[Depends(require_admin)])
def update_station(station_id: UUID, body: StationBody, db: Session = Depends(get_db)):
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    for field, value in body.model_dump().items():
        setattr(station, field, value)
    db.commit()
    db.refresh(station)
    return _to_dict(station)


@router.delete("/{station_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_station(station_id: UUID, db: Session = Depends(get_db)):
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    db.delete(station)
    db.commit()
