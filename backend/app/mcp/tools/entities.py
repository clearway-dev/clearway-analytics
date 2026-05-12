from fastmcp import FastMCP
from app.database import SessionLocal
from app.models import TargetVehicle, Station

entities_server = FastMCP("ClearWay Entities")


@entities_server.tool()
def get_vehicles() -> list[dict]:
    """
    Returns all registered target vehicles (emergency service vehicles) with
    their physical dimensions. Use vehicle IDs from this list with
    check_vehicle_passability or find_passable_route.
    """
    with SessionLocal() as db:
        vehicles = (
            db.query(TargetVehicle).order_by(TargetVehicle.name).all()
        )
        return [
            {
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
            for v in vehicles
        ]


@entities_server.tool()
def get_stations() -> list[dict]:
    """
    Returns all emergency dispatch stations (fire, police, ambulance) with
    their coordinates. Use lat/lon as routing start points in find_passable_route.
    """
    with SessionLocal() as db:
        stations = db.query(Station).order_by(Station.name).all()
        return [
            {
                "id": str(s.id),
                "name": s.name,
                "type": s.type,
                "address": s.address,
                "lat": s.lat,
                "lon": s.lon,
                "notes": s.notes,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in stations
        ]


@entities_server.tool()
def create_vehicle(
    name: str,
    category: str | None = None,
    width: int | None = None,
    height: int | None = None,
    weight: float | None = None,
    length: int | None = None,
    turning_diameter_track: int | None = None,
    turning_diameter_clearance: int | None = None,
    stabilization_width: int | None = None,
) -> dict:
    """
    Inserts a new vehicle into the target_vehicles table.

    All numeric fields are in SI units:
      - width, height, length, turning_diameter_track,
        turning_diameter_clearance, stabilization_width  → centimetres (INTEGER)
      - weight → tonnes

    Args:
        name: Vehicle name, e.g. "CAS 24 SCANIA" (required).
        category: Free-text category, e.g. "Cisterna", "Žebřík".
        width: Vehicle width in centimetres.
        height: Vehicle height in centimetres.
        weight: Vehicle weight in tonnes.
        length: Vehicle length in centimetres.
        turning_diameter_track: Track turning diameter in centimetres.
        turning_diameter_clearance: Clearance turning diameter in centimetres.
        stabilization_width: Width with stabilisers extended in centimetres.

    Returns:
        The saved vehicle record as a dict, including its generated id.
    """
    with SessionLocal() as db:
        vehicle = TargetVehicle(
            name=name,
            category=category,
            width=width,
            height=height,
            weight=weight,
            length=length,
            turning_diameter_track=turning_diameter_track,
            turning_diameter_clearance=turning_diameter_clearance,
            stabilization_width=stabilization_width,
        )
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)
        return {
            "id": str(vehicle.id),
            "name": vehicle.name,
            "category": vehicle.category,
            "width": vehicle.width,
            "height": vehicle.height,
            "weight": vehicle.weight,
            "length": vehicle.length,
            "turning_diameter_track": vehicle.turning_diameter_track,
            "turning_diameter_clearance": vehicle.turning_diameter_clearance,
            "stabilization_width": vehicle.stabilization_width,
            "created_at": vehicle.created_at.isoformat() if vehicle.created_at else None,
        }
