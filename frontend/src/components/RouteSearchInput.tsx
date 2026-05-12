import { useState } from "react";
import { MapPin } from "lucide-react";
import type { NominatimResult } from "../hooks/useAddressSearch";

export interface PinnedResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface RouteSearchInputProps {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  results: NominatimResult[];
  loading: boolean;
  onSelect: (result: NominatimResult) => void;
  dotColor: string;
  // Optional pinned results (e.g. stations) shown at the top, filtered by current query
  pinnedResults?: PinnedResult[];
  onSelectPinned?: (result: PinnedResult) => void;
}

export default function RouteSearchInput({
  placeholder,
  value,
  onChange,
  results,
  loading,
  onSelect,
  dotColor,
  pinnedResults = [],
  onSelectPinned,
}: RouteSearchInputProps) {
  const [showPinnedMenu, setShowPinnedMenu] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => { onChange(e.target.value); setShowPinnedMenu(false); }}
            placeholder={placeholder}
            className="w-full pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* Right-side indicator: stations button or loading spinner */}
          {pinnedResults.length > 0 && !loading && (
            <button
              type="button"
              // onMouseDown + preventDefault keeps input focused and avoids blur race condition
              onMouseDown={(e) => { e.preventDefault(); setShowPinnedMenu((v) => !v); }}
              title="Vybrat ze stanic"
              className={`absolute right-2 top-1/2 -translate-y-1/2 transition-colors ${
                showPinnedMenu ? "text-blue-500" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
          )}
          {loading && (
            <span className="absolute right-2.5 top-2 text-gray-400 text-xs">…</span>
          )}
        </div>
      </div>

      {/* Nominatim address results */}
      {!showPinnedMenu && results.length > 0 && (
        <ul className="absolute left-5 right-0 z-50 bg-white border border-gray-100 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
          {results.map((r) => (
            <li
              key={r.id}
              // onMouseDown prevents input blur from firing before the click registers
              onMouseDown={() => onSelect(r)}
              className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-xs text-gray-700 border-b border-gray-50 last:border-0"
            >
              <span className="font-medium">{r.name.split(",")[0]}</span>
              <span className="text-gray-400 ml-1">
                {r.name.split(",").slice(1, 3).join(",")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Pinned stations dropdown — opened explicitly via the MapPin button */}
      {showPinnedMenu && pinnedResults.length > 0 && (
        <ul className="absolute left-5 right-0 z-50 bg-white border border-gray-100 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
          {pinnedResults.map((p) => (
            <li
              key={`pinned-${p.id}`}
              onMouseDown={() => { onSelectPinned?.(p); setShowPinnedMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-xs text-gray-700 border-b border-gray-50 last:border-0"
            >
              <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="font-medium">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
