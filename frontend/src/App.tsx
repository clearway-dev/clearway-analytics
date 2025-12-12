import BottomSheet from "./components/BottomSheet";
import FloatingPanel from "./components/FloatingPanel";
import MapComponent from "./components/MapComponent";
import { useState } from "react";

interface SegmentData {
  segment_id: string;
  name: string;
  avg_width: number;
  measurements_count: number;
  status: "ok" | "narrow";
}

function App() {
  const [selectedSegment, setSelectedSegment] = useState<SegmentData | null>(
    null
  );
  const [vehicleWidth, setVehicleWidth] = useState<number>(250);
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-100">
      {/* 1. Map Layer (Background) */}
      <div className="absolute inset-0 z-0">
        <MapComponent 
          onSegmentSelect={setSelectedSegment} 
          vehicleWidth={vehicleWidth}
        />
      </div>

      {/* 2. Floating Control Panel (Top Left) */}
      <FloatingPanel 
        vehicleWidth={vehicleWidth} 
        setVehicleWidth={setVehicleWidth}  
      />

      {/* 3. Bottom Sheet (Details) */}
      <BottomSheet
        data={selectedSegment}
        onClose={() => setSelectedSegment(null)}
      />
    </div>
  );
}

export default App;
