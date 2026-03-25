import type { LatLngTuple } from "leaflet";
import { useCallback, useEffect, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Feature, GeoJsonObject, Geometry } from "geojson";
import type { Layer } from "leaflet";
import ObstacleLayer, { type ObstacleFeature } from "./ObstacleLayer";
import apiClient from "../lib/api";

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
  // Routing
  routingMode: boolean;
  onRouteMapClick: (lat: number, lon: number) => void;
  routeGeoJson: GeoJsonObject | null;
  routeStart: LatLngTuple | null;
  routeEnd: LatLngTuple | null;
}

type SegmentFeature = Feature<Geometry, SegmentProperties>;

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
      const res = await apiClient.get(`/api/maps/bbox?${params}`);
      onData(res.data);
    } catch (err) {
      console.error("Error fetching road segments:", err);
    }
  }, [map, selectedDate, onData]);

  useEffect(() => {
    fetchBbox();
  }, [fetchBbox]);

  useMapEvents({ moveend: fetchBbox });

  return null;
}

// -----------------------------------------------------------------------
// Routing click handler
// -----------------------------------------------------------------------
function RoutingClickHandler({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click: (e) => {
      if (enabled) {
        onClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
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
  routingMode,
  onRouteMapClick,
  routeGeoJson,
  routeStart,
  routeEnd,
}: MapComponentProps) {
  const position: LatLngTuple = [49.7384, 13.3736];
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const handleData = useCallback((data: GeoJsonObject) => {
    setGeoJsonData(data);
    setDataVersion((v) => v + 1);
  }, []);

  const geoJsonKey = `${dataVersion}-${vehicleWidth}-${routingMode}`;

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
        if (routingMode) return; // clicks handled by RoutingClickHandler
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
      className={`h-full w-full${routingMode ? " cursor-crosshair" : ""}`}
      zoomControl={false}
    >
      <MapController target={flyToTarget} />
      <BboxLoader selectedDate={selectedDate} onData={handleData} />
      <RoutingClickHandler enabled={routingMode} onClick={onRouteMapClick} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      {/* Road network */}
      {geoJsonData && (
        <GeoJSON
          key={geoJsonKey}
          data={geoJsonData}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      )}

      {/* Computed route */}
      {routeGeoJson && (
        <GeoJSON
          key={`route-${JSON.stringify(routeGeoJson).length}`}
          data={routeGeoJson}
          style={{ color: "#3b82f6", weight: 6, opacity: 0.85 }}
        />
      )}

      {/* Route start marker */}
      {routeStart && (
        <CircleMarker
          center={routeStart}
          radius={8}
          pathOptions={{ color: "#16a34a", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }}
        />
      )}

      {/* Route end marker */}
      {routeEnd && (
        <CircleMarker
          center={routeEnd}
          radius={8}
          pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }}
        />
      )}

      <ObstacleLayer obstacles={obstacles} />
    </MapContainer>
  );
}
