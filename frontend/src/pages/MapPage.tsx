import BottomSheet from "../components/BottomSheet";
import FloatingPanel from "../components/FloatingPanel";
import MapComponent, { type SegmentData } from "../components/MapComponent";
import { useState, useEffect } from "react";
import type { LatLngTuple } from "leaflet";
import { useSearchParams } from "react-router-dom";
import type { ObstacleFeature } from "../components/ObstacleLayer";
import { fetchAvailableDates } from "../services/api";
import type { GeoJsonObject } from "geojson";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function MapPage() {
  const [searchParams] = useSearchParams();

  const urlDate = searchParams.get("date");
  const urlLat = searchParams.get("lat");
  const urlLon = searchParams.get("lon");

  const [selectedSegment, setSelectedSegment] = useState<SegmentData | null>(null);
  const [vehicleWidth, setVehicleWidth] = useState<number>(250);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return urlDate || new Date().toISOString().split("T")[0];
  });

  const [isLiveMode, setIsLiveMode] = useState<boolean>(() => !urlDate);

  const [flyToTarget, setFlyToTarget] = useState<LatLngTuple | null>(() => {
    if (urlLat && urlLon) return [parseFloat(urlLat), parseFloat(urlLon)];
    return null;
  });

  const [obstacles, setObstacles] = useState<ObstacleFeature[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // In latest mode always use the most recent available date — derived, no state sync needed
  const mapDate =
    isLiveMode && availableDates.length > 0 ? availableDates[0] : selectedDate;

  // ------------------------------------------------------------------
  // Routing state
  // ------------------------------------------------------------------
  const [routingMode, setRoutingMode] = useState(false);
  const [routeStart, setRouteStart] = useState<LatLngTuple | null>(null);
  const [routeEnd, setRouteEnd] = useState<LatLngTuple | null>(null);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJsonObject | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------
  useEffect(() => {
    fetchAvailableDates().then(setAvailableDates);
  }, []);

  useEffect(() => {
    if (!isLiveMode && selectedDate) {
      fetch(`${API_URL}/api/analytics/obstacles?target_date=${selectedDate}`)
        .then((res) => res.json())
        .then((data) => setObstacles(data?.features ?? []))
        .catch(() => setObstacles([]));
    }
  }, [selectedDate, isLiveMode]);

  // ------------------------------------------------------------------
  // Routing handlers
  // ------------------------------------------------------------------
  function handleRouteMapClick(lat: number, lon: number) {
    if (!routeStart) {
      setRouteStart([lat, lon]);
      setRouteGeoJson(null);
      setRouteError(null);
      setRouteDistance(null);
    } else if (!routeEnd) {
      const end: LatLngTuple = [lat, lon];
      setRouteEnd(end);
      fetchRoute(routeStart, end);
    }
    // If both are already set, ignore further clicks until user clears
  }

  async function fetchRoute(start: LatLngTuple, end: LatLngTuple) {
    setRouteLoading(true);
    setRouteError(null);
    try {
      const res = await fetch(`${API_URL}/api/routing/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_lat: start[0],
          start_lon: start[1],
          end_lat: end[0],
          end_lon: end[1],
          vehicle_width_cm: vehicleWidth,
          target_date: mapDate,
        }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setRouteGeoJson(data.route);
        setRouteDistance(data.total_distance_m);
      } else {
        setRouteError(data.message ?? "Route not found.");
      }
    } catch {
      setRouteError("Network error.");
    } finally {
      setRouteLoading(false);
    }
  }

  function handleSelectStationAsStart(lat: number, lon: number) {
    if (!routingMode) setRoutingMode(true);
    setRouteStart([lat, lon]);
    setRouteEnd(null);
    setRouteGeoJson(null);
    setRouteDistance(null);
    setRouteError(null);
  }

  // Recalculate existing route when vehicle width changes (debounced)
  useEffect(() => {
    if (!routeStart || !routeEnd) return;
    const timer = setTimeout(() => {
      fetchRoute(routeStart, routeEnd);
    }, 500);
    return () => clearTimeout(timer);
  // fetchRoute is stable — only trigger on vehicleWidth change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleWidth]);

  function clearRoute() {
    setRoutingMode(false);
    setRouteStart(null);
    setRouteEnd(null);
    setRouteGeoJson(null);
    setRouteError(null);
    setRouteDistance(null);
  }

  // ------------------------------------------------------------------
  // Other handlers
  // ------------------------------------------------------------------
  function handleLiveModeChange(isLive: boolean) {
    setIsLiveMode(isLive);
    if (isLive) setObstacles([]);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-100">
      {/* Map layer */}
      <div className="absolute inset-0 z-0">
        <MapComponent
          onSegmentSelect={setSelectedSegment}
          vehicleWidth={vehicleWidth}
          selectedDate={mapDate}
          flyToTarget={flyToTarget}
          obstacles={obstacles}
          routingMode={routingMode}
          onRouteMapClick={handleRouteMapClick}
          routeGeoJson={routeGeoJson}
          routeStart={routeStart}
          routeEnd={routeEnd}
        />
      </div>

      {/* Floating control panel */}
      <FloatingPanel
        vehicleWidth={vehicleWidth}
        setVehicleWidth={setVehicleWidth}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        mapDate={mapDate}
        isLiveMode={isLiveMode}
        setIsLiveMode={handleLiveModeChange}
        onSearchResultSelect={(lat, lon) => setFlyToTarget([lat, lon])}
        availableDates={availableDates}
        routingMode={routingMode}
        onSelectStationAsStart={handleSelectStationAsStart}
        onToggleRouting={() => {
          if (routingMode) {
            clearRoute();
          } else {
            setRoutingMode(true);
            setRouteStart(null);
            setRouteEnd(null);
            setRouteGeoJson(null);
            setRouteError(null);
            setRouteDistance(null);
          }
        }}
        onClearRoute={clearRoute}
        routeStart={routeStart}
        routeEnd={routeEnd}
        routeLoading={routeLoading}
        routeError={routeError}
        routeDistance={routeDistance}
      />

      {/* Segment detail bottom sheet */}
      <BottomSheet
        data={selectedSegment}
        onClose={() => setSelectedSegment(null)}
      />
    </div>
  );
}
