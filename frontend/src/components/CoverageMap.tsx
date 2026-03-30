import { useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
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

interface CoverageMapProps {
  date?: string;
}

export default function CoverageMap({ date }: CoverageMapProps) {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const position: LatLngTuple = [49.7384, 13.3736];

  useEffect(() => {
    const controller = new AbortController();
    const params = date ? `?target_date=${date}` : "";
    apiClient.get(`/api/dashboard/coverage${params}`, { signal: controller.signal })
      .then((res) => setGeoJsonData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [date]);

  const styleFeature = (feature?: CoverageFeature) => {
    if (!feature || !feature.properties) {
      return {};
    }

    const intensity = feature.properties.intensity;
    let color = "#fde047"; // yellow-300 (low)

    if (intensity > 100) {
      color = "#ef4444"; // red-500 (high)
    } else if (intensity > 20) {
      color = "#f97316"; // orange-500 (medium)
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
      {/* Legend */}
      <div className="absolute top-2 left-2 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-md text-xs overflow-hidden">
        <button
          onClick={() => setLegendOpen((v) => !v)}
          className="flex items-center justify-between gap-3 w-full px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>Legenda</span>
          {legendOpen ? <ChevronUp className="h-3 w-3 text-gray-400" /> : <ChevronDown className="h-3 w-3 text-gray-400" />}
        </button>
        <div
          className="overflow-hidden transition-all duration-200 ease-in-out"
          style={{ maxHeight: legendOpen ? "120px" : "0px" }}
        >
          <div className="px-3 pb-2.5 flex flex-col gap-1.5 border-t border-gray-100">
            <div className="flex items-center gap-2 pt-2">
              <span className="w-4 h-1 rounded-full bg-[#fde047] shrink-0" />
              <span className="text-gray-600">Nízké pokrytí (≤ 20)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 rounded-full bg-[#f97316] shrink-0" />
              <span className="text-gray-600">Střední pokrytí (21–100)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 rounded-full bg-[#ef4444] shrink-0" />
              <span className="text-gray-600">Vysoké pokrytí (&gt; 100)</span>
            </div>
          </div>
        </div>
      </div>

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
          <GeoJSON key={date ?? "alltime"} data={geoJsonData} style={styleFeature} />
        )}
      </MapContainer>
    </div>
  );
}
