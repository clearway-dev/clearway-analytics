from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TargetVehicle

router = APIRouter()


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------

class VehicleBody(BaseModel):
    name: str
    category: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    turning_radius_inner: Optional[float] = None
    turning_radius_outer: Optional[float] = None

    @model_validator(mode="after")
    def check_positive_and_radii(self) -> "VehicleBody":
        for field in ("width", "height", "weight", "turning_radius_inner", "turning_radius_outer"):
            value = getattr(self, field)
            if value is not None and value <= 0:
                raise ValueError(f"{field} must be greater than 0")
        if (
            self.turning_radius_inner is not None
            and self.turning_radius_outer is not None
            and self.turning_radius_outer < self.turning_radius_inner
        ):
            raise ValueError("turning_radius_outer must be >= turning_radius_inner")
        return self


def _to_dict(v: TargetVehicle) -> dict:
    return {
        "id": str(v.id),
        "name": v.name,
        "category": v.category,
        "width": v.width,
        "height": v.height,
        "weight": v.weight,
        "turning_radius_inner": v.turning_radius_inner,
        "turning_radius_outer": v.turning_radius_outer,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
    }


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/", response_model=list)
def list_vehicles(db: Session = Depends(get_db)):
    vehicles = db.query(TargetVehicle).order_by(TargetVehicle.name).all()
    return [_to_dict(v) for v in vehicles]


@router.post("/", response_model=dict, status_code=201)
def create_vehicle(body: VehicleBody, db: Session = Depends(get_db)):
    vehicle = TargetVehicle(**body.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return _to_dict(vehicle)


@router.put("/{vehicle_id}", response_model=dict)
def update_vehicle(vehicle_id: UUID, body: VehicleBody, db: Session = Depends(get_db)):
    vehicle = db.query(TargetVehicle).filter(TargetVehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for field, value in body.model_dump().items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    return _to_dict(vehicle)


@router.delete("/{vehicle_id}", status_code=204)
def delete_vehicle(vehicle_id: UUID, db: Session = Depends(get_db)):
    vehicle = db.query(TargetVehicle).filter(TargetVehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    db.delete(vehicle)
    db.commit()
