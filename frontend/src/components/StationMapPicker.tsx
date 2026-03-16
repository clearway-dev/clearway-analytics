import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Marker as LeafletMarker } from "leaflet";
import L from "leaflet";

export interface MapPosition {
  lat: number;
  lng: number;
}

interface StationMapPickerProps {
  position: MapPosition | null;
  onChange: (lat: number, lng: number) => void;
  /** When set, the map animates to this location (forward geocoding result). */
  flyTarget?: MapPosition | null;
}

// Plzeň city centre — default map centre when no position is set yet
const DEFAULT_CENTER: [number, number] = [49.7384, 13.3736];

// Blue circle icon — avoids Leaflet's broken default image paths in Vite
const STATION_ICON = L.divIcon({
  html: `<div style="
    width: 20px; height: 20px;
    background: #2563eb;
    border: 3px solid #fff;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    cursor: grab;
  "></div>`,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// -----------------------------------------------------------------------
// Flies to a new location imperatively — same pattern as MapComponent.tsx
// Skips the initial mount so the MapContainer `center` prop handles that.
// -----------------------------------------------------------------------
function FlyToController({ target }: { target: MapPosition | null | undefined }) {
  const map = useMap();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (target) {
      map.flyTo([target.lat, target.lng], 16, { duration: 1 });
    }
  }, [target, map]);

  return null;
}

// -----------------------------------------------------------------------
// Handles map clicks and renders the draggable marker
// -----------------------------------------------------------------------
function DraggableMarker({
  position,
  onChange,
}: {
  position: MapPosition | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<LeafletMarker>(null);

  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={[position.lat, position.lng]}
      draggable
      icon={STATION_ICON}
      ref={markerRef}
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (marker) {
            const { lat, lng } = marker.getLatLng();
            onChange(lat, lng);
          }
        },
      }}
    />
  );
}

// -----------------------------------------------------------------------
// Public component
// -----------------------------------------------------------------------
export default function StationMapPicker({
  position,
  onChange,
  flyTarget,
}: StationMapPickerProps) {
  const center: [number, number] = position
    ? [position.lat, position.lng]
    : DEFAULT_CENTER;

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={13}
        className="h-56 w-full rounded-lg border border-gray-200"
        style={{ cursor: "crosshair" }}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToController target={flyTarget} />
        <DraggableMarker position={position} onChange={onChange} />
      </MapContainer>

      {!position && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg">
          <span className="rounded-md bg-white/80 px-3 py-1.5 text-xs text-gray-500 shadow backdrop-blur-sm">
            Klikněte na mapu pro umístění stanice
          </span>
        </div>
      )}
    </div>
  );
}
