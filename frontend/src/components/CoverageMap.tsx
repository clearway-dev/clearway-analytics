import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Feature, Geometry } from "geojson";
import type { LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import apiClient from "../lib/api";

interface CoverageProperties {
  id: string;
  intensity: number;
}

type CoverageFeature = Feature<Geometry, CoverageProperties>;

export default function CoverageMap() {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);
  const [loading, setLoading] = useState(true);
  const position: LatLngTuple = [49.7384, 13.3736];

  useEffect(() => {
    apiClient.get("/api/dashboard/coverage")
      .then((res) => setGeoJsonData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
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
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 backdrop-blur-sm rounded-b-xl pointer-events-none">
          <div className="flex items-center gap-2 text-gray-600 text-xs font-medium">
            <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
            Načítám pokrytí…
          </div>
        </div>
      )}
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
    </div>
  );
}
