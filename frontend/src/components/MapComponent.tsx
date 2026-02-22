import type { LatLngTuple } from "leaflet";
import { useCallback, useEffect, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Feature, GeoJsonObject, Geometry } from "geojson";
import type { Layer } from "leaflet";
import ObstacleLayer, { type ObstacleFeature } from "./ObstacleLayer";

export interface SegmentData {
  segment_id: string;
  name: string;
  avg_width: number | null;
  min_width: number | null;
  measurements_count: number | null;
  status: "ok" | "narrow" | "no_data";
}

interface SegmentProperties {
  name: string | null;
  avg_width: number | null;
  min_width: number | null;
  measurements_count: number | null;
}

interface MapComponentProps {
  onSegmentSelect: (data: SegmentData | null) => void;
  vehicleWidth: number;
  selectedDate: string;
  flyToTarget: LatLngTuple | null;
  obstacles?: ObstacleFeature[];
}

type SegmentFeature = Feature<Geometry, SegmentProperties>;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// -----------------------------------------------------------------------
// Fly-to controller
// -----------------------------------------------------------------------
function MapController({ target }: { target: LatLngTuple | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { duration: 1.5 });
    }
  }, [target, map]);
  return null;
}

// -----------------------------------------------------------------------
// Bbox loader — fetches segments for current viewport on mount + moveend
// -----------------------------------------------------------------------
function BboxLoader({
  selectedDate,
  onData,
}: {
  selectedDate: string;
  onData: (data: GeoJsonObject) => void;
}) {
  const map = useMap();

  const fetchBbox = useCallback(async () => {
    const b = map.getBounds();
    const params = new URLSearchParams({
      min_lat: b.getSouth().toString(),
      min_lon: b.getWest().toString(),
      max_lat: b.getNorth().toString(),
      max_lon: b.getEast().toString(),
      target_date: selectedDate,
    });
    try {
      const res = await fetch(`${API_URL}/api/maps/bbox?${params}`);
      const data = await res.json();
      onData(data);
    } catch (err) {
      console.error("Error fetching road segments:", err);
    }
  }, [map, selectedDate, onData]);

  // Fire on mount and whenever selectedDate changes
  useEffect(() => {
    fetchBbox();
  }, [fetchBbox]);

  // Fire on every pan / zoom
  useMapEvents({ moveend: fetchBbox });

  return null;
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------
export default function MapComponent({
  onSegmentSelect,
  vehicleWidth,
  selectedDate,
  flyToTarget,
  obstacles = [],
}: MapComponentProps) {
  const position: LatLngTuple = [49.7384, 13.3736];
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const handleData = useCallback((data: GeoJsonObject) => {
    setGeoJsonData(data);
    setDataVersion((v) => v + 1);
  }, []);

  // Re-key GeoJSON when vehicleWidth changes so colors update immediately
  const geoJsonKey = `${dataVersion}-${vehicleWidth}`;

  const styleFeature = (feature?: SegmentFeature) => {
    const avgWidth = feature?.properties?.avg_width;
    if (avgWidth == null) {
      return { color: "#aaaaaa", weight: 2, opacity: 0.5 };
    }
    return {
      color: avgWidth >= vehicleWidth ? "#2ecc71" : "#e74c3c",
      weight: 4,
      opacity: 0.9,
    };
  };

  const onEachFeature = (feature: SegmentFeature, layer: Layer) => {
    layer.on({
      click: () => {
        const p = feature.properties;
        if (!p) return;
        const avg = p.avg_width;
        const status =
          avg == null ? "no_data" : avg >= vehicleWidth ? "ok" : "narrow";
        onSegmentSelect({
          segment_id: feature.id as string,
          name: p.name ?? "Unknown Road",
          avg_width: avg,
          min_width: p.min_width,
          measurements_count: p.measurements_count,
          status,
        });
      },
    });
  };

  return (
    <MapContainer
      center={position}
      zoom={13}
      className="h-full w-full"
      zoomControl={false}
    >
      <MapController target={flyToTarget} />
      <BboxLoader selectedDate={selectedDate} onData={handleData} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {geoJsonData && (
        <GeoJSON
          key={geoJsonKey}
          data={geoJsonData}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      )}
      <ObstacleLayer obstacles={obstacles} />
    </MapContainer>
  );
}
