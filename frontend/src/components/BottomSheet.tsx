import WidthHistogram from "./WidthHistogram";

interface SegmentData {
  segment_id: string;
  name: string;
  avg_width: number;
  measurements_count: number;
  status: "ok" | "narrow";
}

interface BottomSheetProps {
  data: SegmentData | null;
  onClose: () => void;
}

export default function BottomSheet({ data, onClose }: BottomSheetProps) {
  // If no data is selected, translate panel off-screen (down)
  const translateClass = data ? "translate-y-0" : "translate-y-full";

  return (
    <div
      className={`fixed bottom-0 left-0 w-full bg-white shadow-[0_-5px_20px_rgba(0,0,0,0.1)] 
                        z-[1000] transition-transform duration-300 ease-in-out rounded-t-3xl ${translateClass}`}
    >
      {/* Handle / Grab bar for visual cue */}
      <div className="w-full flex justify-center pt-3 pb-1" onClick={onClose}>
        <div className="w-12 h-1.5 bg-gray-300 rounded-full cursor-pointer hover:bg-gray-400 transition-colors"></div>
      </div>

      {data && (
        <div className="p-6 pb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                {data.name || "Unknown Road"}
              </h2>
              <p className="text-sm text-gray-500">Last updated: 2 hours ago</p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide 
                            ${
                              data.status === "ok"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
            >
              {data.status === "ok" ? "Passable" : "Critical"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="block text-xs text-gray-500 uppercase font-semibold mb-1">
                Avg Width
              </span>
              <span className="text-3xl font-black text-gray-800">
                {data.avg_width}{" "}
                <span className="text-lg text-gray-400 font-medium">cm</span>
              </span>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="block text-xs text-gray-500 uppercase font-semibold mb-1">
                Confidence
              </span>
              <span className="text-lg font-bold text-gray-700">High</span>
              <span className="block text-xs text-gray-400 mt-1">
                {data.measurements_count} measurements
              </span>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <WidthHistogram segmentId={data.segment_id} />
          </div>
        </div>
      )}
    </div>
  );
}
