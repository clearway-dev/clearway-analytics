import { X } from "lucide-react";
import type { SegmentData } from "./MapComponent";
import WidthHistogram from "./WidthHistogram";

interface SegmentPanelProps {
  data: SegmentData | null;
  onClose: () => void;
}

const STATUS_CONFIG = {
  ok: { bg: "bg-green-100", text: "text-green-700", label: "Průjezdné" },
  narrow: { bg: "bg-red-100", text: "text-red-700", label: "Kritické" },
  no_data: { bg: "bg-gray-100", text: "text-gray-500", label: "Bez dat" },
};

export default function SegmentPanel({ data, onClose }: SegmentPanelProps) {
  const visible = data !== null;

  return (
    <div
      className={`absolute top-4 right-4 z-[1000] min-w-72 max-w-[calc(100vw-2rem)]
                  bg-white rounded-xl shadow-lg border border-gray-100
                  transition-all duration-300 ease-in-out
                  ${visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"}`}
    >
      {data && (
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3 gap-2">
            <h2 className="text-base font-bold text-gray-800 leading-tight">
              {data.name || "Neznámá ulice"}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide
                            ${STATUS_CONFIG[data.status].bg} ${STATUS_CONFIG[data.status].text}`}
              >
                {STATUS_CONFIG[data.status].label}
              </span>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Zavřít"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <span className="block text-xs text-gray-500 uppercase font-semibold mb-1">
                Průměrná šířka
              </span>
              {data.avg_width != null ? (
                <span className="text-2xl font-bold text-gray-800">
                  {data.avg_width}{" "}
                  <span className="text-sm text-gray-400 font-medium">cm</span>
                </span>
              ) : (
                <span className="text-2xl font-bold text-gray-400">—</span>
              )}
            </div>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <span className="block text-xs text-gray-500 uppercase font-semibold mb-1">
                Měření
              </span>
              <span className="text-2xl font-bold text-gray-800">
                {data.measurements_count ?? "—"}
              </span>
            </div>
          </div>

          {/* Histogram — only for segments with actual data */}
          {data.status !== "no_data" && (
            <div className="border-t border-gray-100 pt-3">
              <WidthHistogram segmentId={data.segment_id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
