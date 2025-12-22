import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Feature, Geometry } from "geojson";
import type { LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";

interface CoverageProperties {
  id: string;
  intensity: number;
}

type CoverageFeature = Feature<Geometry, CoverageProperties>;

export default function CoverageMap() {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);
  const position: LatLngTuple = [49.7384, 13.3736];

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

    fetch(`${apiUrl}/api/dashboard/coverage`)
      .then((res) => res.json())
      .then((data) => {
        setGeoJsonData(data);
      })
      .catch((err) => {
        console.error("Error fetching coverage map data:", err);
      });
  }, []);

  const styleFeature = (feature?: CoverageFeature) => {
    if (!feature || !feature.properties) {
      return {};
    }

    const intensity = feature.properties.intensity;
    let color = "#3b82f6"; // Blue (low)

    if (intensity > 100) {
      color = "#ef4444"; // Red (hot)
    } else if (intensity > 20) {
      color = "#f97316"; // Orange (medium)
    }

    return {
      color: color,
      weight: 3,
      opacity: 0.8,
    };
  };

  return (
    <MapContainer
      center={position}
      zoom={13}
      className="h-full w-full rounded-b-xl"
      zoomControl={false}
      scrollWheelZoom={true}
      dragging={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {geoJsonData && (
        <GeoJSON data={geoJsonData} style={styleFeature} />
      )}
    </MapContainer>
  );
}
