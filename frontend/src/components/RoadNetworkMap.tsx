import { useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMapEvents } from "react-leaflet";
import type { LatLngTuple, Layer } from "leaflet";
import type { GeoJsonObject, Feature, Geometry } from "geojson";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface RoadProperties {
  name: string | null;
  avg_width: number | null;
  min_width: number | null;
}

type RoadFeature = Feature<Geometry, RoadProperties>;

interface BBox {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
}

interface MapEventsProps {
  onMoveEnd: (bbox: BBox) => void;
}

function MapEvents({ onMoveEnd }: MapEventsProps) {
  useMapEvents({
    moveend: (e) => {
      const b = e.target.getBounds();
      onMoveEnd({
        min_lat: b.getSouth(),
        min_lon: b.getWest(),
        max_lat: b.getNorth(),
        max_lon: b.getEast(),
      });
    },
  });
  return null;
}

export default function RoadNetworkMap() {
  const position: LatLngTuple = [49.7384, 13.3736];
  const [roads, setRoads] = useState<GeoJsonObject | null>(null);
  const [loading, setLoading] = useState(false);
  const dataKey = useRef(0);

  const fetchRoads = useCallback(async (bbox: BBox) => {
    setLoading(true);
    try {
      const { min_lat, min_lon, max_lat, max_lon } = bbox;
      const res = await fetch(
        `${API_URL}/api/maps/bbox?min_lat=${min_lat}&min_lon=${min_lon}&max_lat=${max_lat}&max_lon=${max_lon}`
      );
      const data = await res.json();
      dataKey.current += 1;
      setRoads(data);
    } catch (err) {
      console.error("Error fetching roads:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const styleFeature = (feature?: RoadFeature) => {
    const avgWidth = feature?.properties?.avg_width;
    if (avgWidth === null || avgWidth === undefined) {
      return { color: "#888888", weight: 2, opacity: 0.6 };
    }
    return {
      color: avgWidth < 3.0 ? "#e74c3c" : "#2ecc71",
      weight: 4,
      opacity: 0.9,
    };
  };

  const onEachFeature = (feature: RoadFeature, layer: Layer) => {
    const { name, avg_width } = feature.properties ?? {};
    const widthLabel =
      avg_width != null ? `${avg_width.toFixed(2)} cm` : "Bez dat";
    layer.bindPopup(
      `<strong>${name ?? "Neznámá ulice"}</strong><br/>Průměrná šířka: ${widthLabel}`
    );
  };

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      {loading && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "white",
            padding: "4px 12px",
            borderRadius: 4,
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          }}
        >
          Načítám…
        </div>
      )}
      <MapContainer
        center={position}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents onMoveEnd={fetchRoads} />
        {roads && (
          <GeoJSON
            key={dataKey.current}
            data={roads}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>
    </div>
  );
}
