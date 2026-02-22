import type { SegmentData } from "./MapComponent";
import WidthHistogram from "./WidthHistogram";

interface BottomSheetProps {
  data: SegmentData | null;
  onClose: () => void;
}

const STATUS_CONFIG = {
  ok: { bg: "bg-green-100", text: "text-green-700", label: "Passable" },
  narrow: { bg: "bg-red-100", text: "text-red-700", label: "Critical" },
  no_data: { bg: "bg-gray-100", text: "text-gray-500", label: "No data" },
};

export default function BottomSheet({ data, onClose }: BottomSheetProps) {
  const translateClass = data ? "translate-y-0" : "translate-y-full";

  return (
    <div
      className={`fixed bottom-0 left-0 w-full bg-white shadow-[0_-5px_20px_rgba(0,0,0,0.1)]
                        z-[1000] transition-transform duration-300 ease-in-out rounded-t-3xl ${translateClass}`}
    >
      {/* Handle / Grab bar */}
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
            </div>
            {(() => {
              const s = STATUS_CONFIG[data.status];
              return (
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${s.bg} ${s.text}`}
                >
                  {s.label}
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="block text-xs text-gray-500 uppercase font-semibold mb-1">
                Avg Width
              </span>
              {data.avg_width != null ? (
                <span className="text-3xl font-black text-gray-800">
                  {data.avg_width}{" "}
                  <span className="text-lg text-gray-400 font-medium">cm</span>
                </span>
              ) : (
                <span className="text-3xl font-black text-gray-400">—</span>
              )}
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="block text-xs text-gray-500 uppercase font-semibold mb-1">
                Measurements
              </span>
              <span className="text-lg font-bold text-gray-700">
                {data.measurements_count ?? "—"}
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
