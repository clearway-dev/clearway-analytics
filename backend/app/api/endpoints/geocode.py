from fastapi import APIRouter, Depends, HTTPException
import httpx

from app.api.deps import get_current_active_user

router = APIRouter()

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
_USER_AGENT = "ClearWay-Analytics-App/1.0"


@router.get("/reverse", dependencies=[Depends(get_current_active_user)])
async def reverse_geocode(lat: float, lon: float):
    """
    Proxy for Nominatim reverse geocoding.

    Keeps the Nominatim call server-side so the frontend never contacts
    Nominatim directly (avoids ToS violations and browser CORS issues).
    Returns a simplified address object.
    """
    params = {
        "format": "json",
        "lat": lat,
        "lon": lon,
        "zoom": 18,
        "addressdetails": 1,
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                _NOMINATIM_URL,
                params=params,
                headers={"User-Agent": _USER_AGENT},
                timeout=8.0,
            )
            resp.raise_for_status()
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Nominatim request timed out")
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Nominatim unreachable: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502, detail=f"Nominatim returned {exc.response.status_code}"
            )

    data = resp.json()
    addr = data.get("address", {})

    road = addr.get("road") or addr.get("pedestrian") or addr.get("path") or ""
    house = addr.get("house_number", "")
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or ""
    )

    street_part = f"{road} {house}".strip() if house else road
    address_str = ", ".join(filter(bool, [street_part, city]))

    return {
        "address": address_str or data.get("display_name", ""),
        "city": city,
    }


_NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"


@router.get("/forward", dependencies=[Depends(get_current_active_user)])
async def forward_geocode(q: str):
    """
    Proxy for Nominatim forward geocoding (address → coordinates).

    Returns up to 5 candidate locations for the given query string.
    Restricted to CZ by default to keep results relevant.
    """
    if not q or len(q.strip()) < 2:
        return []

    params = {
        "format": "json",
        "q": q.strip(),
        "limit": 5,
        "countrycodes": "cz",
        "addressdetails": 1,
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                _NOMINATIM_SEARCH_URL,
                params=params,
                headers={"User-Agent": _USER_AGENT},
                timeout=8.0,
            )
            resp.raise_for_status()
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Nominatim request timed out")
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Nominatim unreachable: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502, detail=f"Nominatim returned {exc.response.status_code}"
            )

    return [
        {
            "display_name": r["display_name"],
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
        }
        for r in resp.json()
    ]
