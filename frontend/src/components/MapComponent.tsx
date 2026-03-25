import type { LatLngTuple } from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
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
  center: LatLngTuple;
}

interface SegmentProperties {
  name: string | null;
  avg_width: number | null;
  min_width: number | null;
  measurements_count: number | null;
}

export interface FlyToTarget {
  center: LatLngTuple;
  zoom: number;
}

interface MapComponentProps {
  onSegmentSelect: (data: SegmentData | null) => void;
  vehicleWidth: number;
  selectedDate: string;
  flyToTarget: FlyToTarget | null;
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
function MapController({ target }: { target: FlyToTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.center, target.zoom, { duration: 1.5 });
    }
  }, [target, map]);
  return null;
}

// -----------------------------------------------------------------------
// Bbox loader — fetches segments for current viewport on mount + moveend + zoomend.
// Skips the API call when zoomed out below MIN_ZOOM and clears stale data instead.
// -----------------------------------------------------------------------
const MIN_ZOOM = 14;
const DEBOUNCE_MS = 300;

function BboxLoader({
  selectedDate,
  onData,
}: {
  selectedDate: string;
  onData: (data: GeoJsonObject) => void;
}) {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Below MIN_ZOOM the bbox is too large — clear segments and bail out
      if (map.getZoom() < MIN_ZOOM) {
        onData({ type: "FeatureCollection", features: [] } as GeoJsonObject);
        return;
      }

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
    }, DEBOUNCE_MS);
  }, [map, selectedDate, onData]);

  useEffect(() => {
    scheduleFetch();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scheduleFetch]);

  useMapEvents({ moveend: scheduleFetch, zoomend: scheduleFetch });

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leafletCenter = (layer as any).getBounds?.().getCenter();
        const center: LatLngTuple = leafletCenter
          ? [leafletCenter.lat, leafletCenter.lng]
          : [0, 0];
        onSegmentSelect({
          segment_id: feature.id as string,
          name: p.name ?? "Unknown Road",
          avg_width: avg,
          min_width: p.min_width,
          measurements_count: p.measurements_count,
          status,
          center,
        });
      },
    });
  };

  return (
    <MapContainer
      center={position}
      zoom={14}
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
