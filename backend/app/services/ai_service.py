import json
import re

from google import genai

from app.core.config import GOOGLE_API_KEY

_SYSTEM_PROMPT = """
You are a technical data extractor for emergency vehicle specifications.
Extract ALL vehicles found in the provided text and return ONLY a valid JSON array of objects — no markdown, no explanation, nothing else.

For each vehicle extract these fields:
- "name": vehicle name/model as a string (e.g. "CAS 24 SCANIA")
- "category": one of: "fire_truck", "ambulance", "police", "rescue", "other"
  - CAS, AZ, AP, TA, DA, RZA and similar fire service vehicles → "fire_truck"
  - Ambulance, Sanitka, ZZS → "ambulance"
  - Policie → "police"
  - Záchranná služba, horská záchrana → "rescue"
  - Anything else → "other"
- "width": vehicle width in centimetres as INTEGER (e.g. "2,55 m" → 255, "2550 mm" → 255)
- "height": vehicle height in centimetres as INTEGER
- "length": vehicle length in centimetres as INTEGER
- "turning_diameter_track": outer track turning diameter (stopový) in centimetres as INTEGER
- "turning_diameter_clearance": outer clearance turning diameter (obrysový) in centimetres as INTEGER
- "stabilization_width": width with stabilisers extended in centimetres as INTEGER
- "weight": vehicle weight in tonnes as FLOAT (e.g. "14 500 kg" → 14.5, "17,5 tun" → 17.5)

Rules:
- Convert all measurements: metres × 100 = cm, mm ÷ 10 = cm, kg ÷ 1000 = tonnes.
- If a value is not present for a vehicle, use null.
- Extract EVERY distinct vehicle mentioned in the text.
- Return ONLY the JSON array, nothing else.

Example output:
[
  {"name": "CAS 24 SCANIA", "category": "fire_truck", "width": 255, "height": 340, "length": 765, "turning_diameter_track": 1600, "turning_diameter_clearance": null, "stabilization_width": null, "weight": 18.6},
  {"name": "AZ 52 IVECO MAGIRUS", "category": "fire_truck", "width": 250, "height": 388, "length": 1200, "turning_diameter_track": 1800, "turning_diameter_clearance": 2345, "stabilization_width": 700, "weight": 26.0}
]
"""


def _init_model() -> genai.Client:
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY is not set in environment variables.")
    return genai.Client(api_key=GOOGLE_API_KEY)


def _normalise_vehicle(data: dict) -> dict:
    """Coerce field types: cm fields → int, weight → float."""
    cm_fields = ("width", "height", "length", "turning_diameter_track",
                 "turning_diameter_clearance", "stabilization_width")
    for field in cm_fields:
        val = data.get(field)
        if val is not None:
            data[field] = int(round(float(val)))
    weight = data.get("weight")
    if weight is not None:
        data["weight"] = float(weight)
    return data


def parse_vehicles_from_text(text: str) -> list[dict]:
    """
    Send raw vehicle spec text to Gemini and return a list of extracted vehicles.
    All dimensional values are in centimetres (int), weight in tonnes (float).
    Missing fields are None.
    """
    client = _init_model()
    prompt = f"{_SYSTEM_PROMPT}\n\nText to parse:\n{text}"
    response = client.models.generate_content(model="gemini-3.1-flash-lite", contents=prompt)

    raw = response.text.strip()
    # Strip markdown code fences if model wraps output despite instructions
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)

    # Normalise: always work with a list
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("AI returned no vehicle data.")

    return [_normalise_vehicle(v) for v in data]
