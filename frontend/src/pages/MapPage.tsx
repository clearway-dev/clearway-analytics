import BottomSheet from "../components/BottomSheet";
import FloatingPanel from "../components/FloatingPanel";
import MapComponent from "../components/MapComponent";
import { useState, useEffect } from "react";
import type { LatLngTuple } from "leaflet";
import { useSearchParams } from "react-router-dom";
import type { ObstacleFeature } from "../components/ObstacleLayer";

interface SegmentData {
  segment_id: string;
  name: string;
  avg_width: number;
  measurements_count: number;
  status: "ok" | "narrow";
}

export default function MapPage() {
  const [searchParams] = useSearchParams();
  
  // Read params immediately for initial state
  const urlDate = searchParams.get("date");
  const urlLat = searchParams.get("lat");
  const urlLon = searchParams.get("lon");

  const [selectedSegment, setSelectedSegment] = useState<SegmentData | null>(
    null
  );
  
  const [vehicleWidth, setVehicleWidth] = useState<number>(250);
  
  // Initialize state from URL params to prevent cascading renders and ensure data loads immediately
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return urlDate || new Date().toISOString().split('T')[0];
  });

  const [isLiveMode, setIsLiveMode] = useState<boolean>(() => {
    return !urlDate; // If date is provided, we are in history mode
  });

  const [flyToTarget, setFlyToTarget] = useState<LatLngTuple | null>(() => {
    if (urlLat && urlLon) {
      return [parseFloat(urlLat), parseFloat(urlLon)];
    }
    return null;
  });

  const [obstacles, setObstacles] = useState<ObstacleFeature[]>([]);

  // Fetch obstacles when date changes (only in history mode)
  useEffect(() => {
    if (!isLiveMode && selectedDate) {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      fetch(`${apiUrl}/api/analytics/obstacles?target_date=${selectedDate}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.features) {
            setObstacles(data.features);
          } else {
            setObstacles([]);
          }
        })
        .catch((err) => {
          console.error("Failed to load obstacles:", err);
          setObstacles([]);
        });
    }
  }, [selectedDate, isLiveMode]);

  const handleSearchResultSelect = (lat: number, lon: number) => {
    setFlyToTarget([lat, lon]);
  };

  const handleLiveModeChange = (isLive: boolean) => {
    setIsLiveMode(isLive);
    if (isLive) {
      setObstacles([]);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-100">
      {/* 1. Map Layer (Background) */}
      <div className="absolute inset-0 z-0">
        <MapComponent
          onSegmentSelect={setSelectedSegment}
          vehicleWidth={vehicleWidth}
          selectedDate={selectedDate}
          flyToTarget={flyToTarget}
          obstacles={obstacles}
        />
      </div>

      {/* 2. Floating Control Panel (Top Left) */}
      <FloatingPanel
        vehicleWidth={vehicleWidth}
        setVehicleWidth={setVehicleWidth}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        isLiveMode={isLiveMode}
        setIsLiveMode={handleLiveModeChange}
        onSearchResultSelect={handleSearchResultSelect}
      />

      {/* 3. Bottom Sheet (Details) */}
      <BottomSheet
        data={selectedSegment}
        onClose={() => setSelectedSegment(null)}
      />
    </div>
  );
}
