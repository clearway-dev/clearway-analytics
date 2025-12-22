import type { LatLngTuple } from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJsonObject, Feature, Geometry } from "geojson";
import type { Layer } from "leaflet";
import ObstacleLayer, { type ObstacleFeature } from "./ObstacleLayer";

interface SegmentData {
  segment_id: string;
  name: string;
  avg_width: number;
  measurements_count: number;
  status: "ok" | "narrow";
}

interface MapComponentProps {
  onSegmentSelect: (data: SegmentData | null) => void;
  vehicleWidth: number;
  selectedDate: string;
  flyToTarget: LatLngTuple | null;
  obstacles?: ObstacleFeature[];
}

type SegmentFeature = Feature<Geometry, SegmentData>;

function MapController({ target }: { target: LatLngTuple | null }) {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, {
        duration: 1.5
      });
    }
  }, [target, map]);

  return null;
}

export default function MapComponent({
  onSegmentSelect,
  vehicleWidth,
  selectedDate,
  flyToTarget,
  obstacles = [],
}: MapComponentProps) {
  const position: LatLngTuple = [49.7384, 13.3736];

  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);

  const loading = selectedDate !== loadedDate;

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

    fetch(`${apiUrl}/api/map/segments?target_date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        console.log(`Data loaded for ${selectedDate}:`, data);
        setGeoJsonData(data);
        setLoadedDate(selectedDate);
      })
      .catch((err) => {
        console.error("Error fetching map data:", err);
        setLoadedDate(selectedDate); 
      });
  }, [selectedDate]);

  const styleFeature = (feature?: SegmentFeature) => {
    if (!feature || !feature.properties) {
      return {};
    }

    const avgWidth = feature.properties.avg_width;
    const isPassable = avgWidth >= vehicleWidth + 0.5;

    return {
      color: isPassable ? "#2ecc71" : "#e74c3c",
      weight: 4,
      opacity: 0.9,
    };
  };

  const onEachFeature = (feature: SegmentFeature, layer: Layer) => {
    layer.on({
      click: () => {
        if (feature.properties) {
          onSegmentSelect(feature.properties);
        }
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {!loading && geoJsonData && (
        <GeoJSON
          key={`geo-data-${vehicleWidth}-${selectedDate}`}
          data={geoJsonData}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      )}
      <ObstacleLayer obstacles={obstacles} />
    </MapContainer>
  );
}
