import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import apiClient from "../lib/api";
import StationMapPicker, { type MapPosition } from "./StationMapPicker";

export const STATION_TYPES: { value: string; label: string }[] = [
  { value: "fire_station", label: "Hasičská stanice" },
  { value: "police", label: "Policie" },
  { value: "hospital", label: "Nemocnice" },
  { value: "rescue", label: "Záchranná služba" },
  { value: "other", label: "Jiné" },
];

export interface FormState {
  name: string;
  type: string;
  address: string;
  lat: string;
  lon: string;
  notes: string;
}

export const EMPTY_FORM: FormState = {
  name: "",
  type: "",
  address: "",
  lat: "",
  lon: "",
  notes: "",
};

export function toFormState(s: {
  name: string;
  type: string | null;
  address: string | null;
  lat: number;
  lon: number;
  notes: string | null;
}): FormState {
  return {
    name: s.name,
    type: s.type ?? "",
    address: s.address ?? "",
    lat: String(s.lat),
    lon: String(s.lon),
    notes: s.notes ?? "",
  };
}

interface Suggestion {
  display_name: string;
  lat: number;
  lon: number;
}

interface StationFormModalProps {
  editingId: string | null;
  form: FormState;
  formError: string | null;
  saving: boolean;
  initialMapPosition: MapPosition | null;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: (field: keyof FormState, value: string) => void;
}

export default function StationFormModal({
  editingId,
  form,
  formError,
  saving,
  initialMapPosition,
  onClose,
  onSave,
  onFieldChange,
}: StationFormModalProps) {
  const [mapPosition, setMapPosition] = useState<MapPosition | null>(initialMapPosition);
  const [flyTarget, setFlyTarget] = useState<MapPosition | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);

  const geocodeAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      geocodeAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  async function handleMapChange(lat: number, lng: number) {
    setMapPosition({ lat, lng });
    onFieldChange("lat", String(lat));
    onFieldChange("lon", String(lng));

    geocodeAbortRef.current?.abort();
    const controller = new AbortController();
    geocodeAbortRef.current = controller;

    setGeocoding(true);
    try {
      const res = await apiClient.get<{ address: string; city: string }>(
        "/api/v1/geocode/reverse",
        { params: { lat, lon: lng }, signal: controller.signal },
      );
      onFieldChange("address", res.data.address);
    } catch {
      // Silently ignore aborted requests or geocoding failures
    } finally {
      setGeocoding(false);
    }
  }

  const searchAddress = useCallback(async (q: string) => {
    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    setSearching(true);
    try {
      const res = await apiClient.get<{ display_name: string; lat: number; lon: number }[]>(
        "/api/v1/geocode/forward",
        { params: { q }, signal: ctrl.signal },
      );
      setSuggestions(res.data);
      setShowSuggestions(res.data.length > 0);
    } catch {
      // Silently ignore aborted or failed requests
    } finally {
      setSearching(false);
    }
  }, []);

  function handleAddressInput(value: string) {
    onFieldChange("address", value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => searchAddress(value.trim()), 300);
  }

  function handleSuggestionSelect(s: Suggestion) {
    // Use only the first two comma-separated parts as the stored address
    const shortAddress = s.display_name.split(",").slice(0, 2).join(",").trim();
    const pos: MapPosition = { lat: s.lat, lng: s.lon };
    onFieldChange("address", shortAddress);
    onFieldChange("lat", String(s.lat));
    onFieldChange("lon", String(s.lon));
    setMapPosition(pos);
    setFlyTarget(pos);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">
            {editingId ? "Upravit stanici" : "Nová stanice"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Interactive map — click to place, drag to refine */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Poloha na mapě <span className="text-red-500">*</span>
            </label>
            <StationMapPicker
              position={mapPosition}
              onChange={handleMapChange}
              flyTarget={flyTarget}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Název <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="např. Stanice HZS Plzeň-město"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
            <select
              value={form.type}
              onChange={(e) => onFieldChange("type", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— Nevybráno —</option>
              {STATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresa
              {(geocoding || searching) && (
                <span className="ml-2 text-xs font-normal text-blue-500">
                  {geocoding ? "Načítám adresu…" : "Hledám…"}
                </span>
              )}
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => handleAddressInput(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Začněte psát adresu nebo klikněte na mapu…"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-[1000] mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    onMouseDown={() => handleSuggestionSelect(s)}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                  >
                    <span className="font-medium text-gray-800">
                      {s.display_name.split(",")[0]}
                    </span>
                    <span className="ml-1 text-gray-400 text-xs">
                      {s.display_name.split(",").slice(1, 3).join(",")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Coordinates — read-only confirmation, sourced from map */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zeměpisná šířka
              </label>
              <input
                type="number"
                step="0.00001"
                value={form.lat}
                onChange={(e) => onFieldChange("lat", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="49.74832"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zeměpisná délka
              </label>
              <input
                type="number"
                step="0.00001"
                value={form.lon}
                onChange={(e) => onFieldChange("lon", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="13.37736"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Poznámky</label>
            <textarea
              value={form.notes}
              onChange={(e) => onFieldChange("notes", e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Volitelné poznámky"
            />
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </div>
    </div>
  );
}
