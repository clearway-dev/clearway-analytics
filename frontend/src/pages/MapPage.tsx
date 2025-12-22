import BottomSheet from "../components/BottomSheet";
import FloatingPanel from "../components/FloatingPanel";
import MapComponent from "../components/MapComponent";
import { useState } from "react";
import type { LatLngTuple } from "leaflet";

interface SegmentData {
  segment_id: string;
  name: string;
  avg_width: number;
  measurements_count: number;
  status: "ok" | "narrow";
}

export default function MapPage() {
  const [selectedSegment, setSelectedSegment] = useState<SegmentData | null>(
    null
  );
  const [vehicleWidth, setVehicleWidth] = useState<number>(250);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true);
  const [flyToTarget, setFlyToTarget] = useState<LatLngTuple | null>(null);

  const handleSearchResultSelect = (lat: number, lon: number) => {
    setFlyToTarget([lat, lon]);
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
        />
      </div>

      {/* 2. Floating Control Panel (Top Left) */}
      <FloatingPanel
        vehicleWidth={vehicleWidth}
        setVehicleWidth={setVehicleWidth}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        isLiveMode={isLiveMode}
        setIsLiveMode={setIsLiveMode}
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
