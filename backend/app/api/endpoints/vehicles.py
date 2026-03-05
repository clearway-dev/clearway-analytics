from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_admin
from app.database import get_db
from app.models import TargetVehicle

router = APIRouter()


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------

class VehicleBody(BaseModel):
    name: str
    category: Optional[str] = None
    width: Optional[int] = None                     # cm
    height: Optional[int] = None                    # cm
    weight: Optional[float] = None                  # tonnes
    length: Optional[int] = None                    # cm
    turning_diameter_track: Optional[int] = None    # cm
    turning_diameter_clearance: Optional[int] = None  # cm
    stabilization_width: Optional[int] = None       # cm

    @model_validator(mode="after")
    def check_positive(self) -> "VehicleBody":
        for field in ("width", "height", "weight", "length", "turning_diameter_track", "turning_diameter_clearance", "stabilization_width"):
            value = getattr(self, field)
            if value is not None and value <= 0:
                raise ValueError(f"{field} must be greater than 0")
        return self


def _to_dict(v: TargetVehicle) -> dict:
    return {
        "id": str(v.id),
        "name": v.name,
        "category": v.category,
        "width": v.width,
        "height": v.height,
        "weight": v.weight,
        "length": v.length,
        "turning_diameter_track": v.turning_diameter_track,
        "turning_diameter_clearance": v.turning_diameter_clearance,
        "stabilization_width": v.stabilization_width,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/", response_model=list, dependencies=[Depends(get_current_active_user)])
def list_vehicles(db: Session = Depends(get_db)):
    vehicles = db.query(TargetVehicle).order_by(TargetVehicle.name).all()
    return [_to_dict(v) for v in vehicles]


@router.post("/", response_model=dict, status_code=201, dependencies=[Depends(require_admin)])
def create_vehicle(body: VehicleBody, db: Session = Depends(get_db)):
    vehicle = TargetVehicle(**body.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return _to_dict(vehicle)


@router.put("/{vehicle_id}", response_model=dict, dependencies=[Depends(require_admin)])
def update_vehicle(vehicle_id: UUID, body: VehicleBody, db: Session = Depends(get_db)):
    vehicle = db.query(TargetVehicle).filter(TargetVehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for field, value in body.model_dump().items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    return _to_dict(vehicle)


@router.delete("/{vehicle_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_vehicle(vehicle_id: UUID, db: Session = Depends(get_db)):
    vehicle = db.query(TargetVehicle).filter(TargetVehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    db.delete(vehicle)
    db.commit()
