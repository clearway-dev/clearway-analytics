import { useState, useEffect, useRef } from "react";
import apiClient from "../lib/api";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import { Search, CalendarIcon, ChevronDown, Navigation, X, Loader2, MapPin } from "lucide-react";
import type { LatLngTuple } from "leaflet";


// ─── Nominatim result type ───────────────────────────────────────────────────

interface NominatimResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

// ─── Reusable address search hook ────────────────────────────────────────────

function useAddressSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  // When true, the next query change skips the search (used after selection)
  const suppressRef = useRef(false);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    const timer = setTimeout(async () => {
      if (query.length < 3) { setResults([]); return; }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query, format: "json", limit: "6",
          addressdetails: "1", countrycodes: "cz",
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { "User-Agent": "ClearWayAnalytics/1.0 (thesis project)" } },
        );
        const data: { place_id: string; lat: string; lon: string; display_name: string }[] =
          await res.json();
        setResults(
          data.map((item) => ({
            id: item.place_id,
            name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Sets query and suppresses the next search trigger (call after user selects a result)
  function setQuerySelected(q: string) {
    suppressRef.current = true;
    setQuery(q);
  }

  return { query, setQuery, setQuerySelected, results, setResults, loading };
}

// ─── Route search input sub-component ────────────────────────────────────────

interface PinnedResult {
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

function RouteSearchInput({
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

// ─── Component interfaces ─────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  name: string;
  center_lat: number;
  center_lon: number;
}

interface VehicleOption {
  id: string;
  name: string;
  width: number | null;
}

interface StationOption {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface FloatingPanelProps {
  vehicleWidth: number;
  setVehicleWidth: (width: number) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  mapDate: string;
  isLiveMode: boolean;
  setIsLiveMode: (isLive: boolean) => void;
  onSearchResultSelect: (lat: number, lon: number) => void;
  availableDates: string[];
  // Routing
  routingMode: boolean;
  onToggleRouting: () => void;
  onClearRoute: () => void;
  onSetRouteStart: (lat: number, lon: number) => void;
  onSetRouteEnd: (lat: number, lon: number) => void;
  routeStart: LatLngTuple | null;
  routeEnd: LatLngTuple | null;
  routeLoading: boolean;
  routeError: string | null;
  routeDistance: number | null;
}

function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FloatingPanel({
  vehicleWidth,
  setVehicleWidth,
  selectedDate,
  setSelectedDate,
  mapDate,
  isLiveMode,
  setIsLiveMode,
  onSearchResultSelect,
  availableDates,
  routingMode,
  onToggleRouting,
  onClearRoute,
  onSetRouteStart,
  onSetRouteEnd,
  routeStart,
  routeEnd,
  routeLoading,
  routeError,
  routeDistance,
}: FloatingPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [widthInput, setWidthInput] = useState<string>(String(vehicleWidth));
  const [stations, setStations] = useState<StationOption[]>([]);

  // Routing address search state
  const startSearch = useAddressSearch();
  const endSearch = useAddressSearch();

  // Refs to detect whether the input itself set routeStart/End (skip prop→text sync)
  const startSetByInput = useRef(false);
  const endSetByInput = useRef(false);

  // Sync routeStart prop → start text field (only when set externally, e.g. map click)
  useEffect(() => {
    if (startSetByInput.current) { startSetByInput.current = false; return; }
    if (routeStart) {
      startSearch.setQuery(`${routeStart[0].toFixed(5)}, ${routeStart[1].toFixed(5)}`);
      startSearch.setResults([]);
    } else {
      startSearch.setQuery("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeStart]);

  // Sync routeEnd prop → end text field
  useEffect(() => {
    if (endSetByInput.current) { endSetByInput.current = false; return; }
    if (routeEnd) {
      endSearch.setQuery(`${routeEnd[0].toFixed(5)}, ${routeEnd[1].toFixed(5)}`);
      endSearch.setResults([]);
    } else {
      endSearch.setQuery("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeEnd]);

  // Clear route inputs when routing mode is turned off
  useEffect(() => {
    if (!routingMode) {
      startSearch.setQuery("");
      startSearch.setResults([]);
      endSearch.setQuery("");
      endSearch.setResults([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingMode]);

  useEffect(() => {
    setWidthInput(String(vehicleWidth));
  }, [vehicleWidth]);

  useEffect(() => {
    apiClient.get<VehicleOption[]>("/api/vehicles/")
      .then((r) => setVehicles(r.data))
      .catch(() => setVehicles([]));

    apiClient.get<StationOption[]>("/api/stations/")
      .then((r) => setStations(r.data))
      .catch(() => setStations([]));
  }, []);

  // Debounced map address search (for the top "Hledat ulici" field)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 3) {
        setIsSearchLoading(true);
        const params = new URLSearchParams({
          q: searchQuery, format: "json", limit: "6",
          addressdetails: "1", countrycodes: "cz",
        });
        fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: { "User-Agent": "ClearWayAnalytics/1.0 (thesis project)" },
        })
          .then((r) => r.json())
          .then((data: { place_id: string; lat: string; lon: string; display_name: string }[]) => {
            setSearchResults(
              data.map((item) => ({
                id: item.place_id,
                name: item.display_name,
                center_lat: parseFloat(item.lat),
                center_lon: parseFloat(item.lon),
              }))
            );
            setIsSearchLoading(false);
          })
          .catch(() => { setIsSearchLoading(false); setSearchResults([]); });
      } else {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function handleResultClick(result: SearchResult) {
    onSearchResultSelect(result.center_lat, result.center_lon);
    setSearchQuery("");
    setSearchResults([]);
  }

  function handleLatestClick() {
    setIsLiveMode(true);
    const latest = availableDates[0] ?? new Date().toISOString().split("T")[0];
    setSelectedDate(latest);
    setShowCalendar(false);
  }

  function handleHistoryClick() {
    setIsLiveMode(false);
    setShowCalendar(false);
  }

  function handleVehicleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSelectedVehicleId(id);
    if (!id) return;
    const vehicle = vehicles.find((v) => v.id === id);
    if (vehicle && vehicle.width != null) {
      setVehicleWidth(Math.min(500, Math.max(150, vehicle.width)));
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setVehicleWidth(val);
    setSelectedVehicleId("");
  }

  function handleWidthInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setWidthInput(e.target.value);
    setSelectedVehicleId("");
  }

  function handleWidthInputBlur() {
    const parsed = parseInt(widthInput, 10);
    if (!isNaN(parsed)) {
      setVehicleWidth(Math.min(500, Math.max(150, parsed)));
    } else {
      setWidthInput(String(vehicleWidth));
    }
  }

  function handleWidthInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  }

  function handleStartSelect(result: NominatimResult) {
    startSetByInput.current = true;
    startSearch.setQuerySelected(result.name.split(",")[0].trim());
    startSearch.setResults([]);
    onSetRouteStart(result.lat, result.lon);
  }

  function handleEndSelect(result: NominatimResult) {
    endSetByInput.current = true;
    endSearch.setQuerySelected(result.name.split(",")[0].trim());
    endSearch.setResults([]);
    onSetRouteEnd(result.lat, result.lon);
  }

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-white p-4 rounded-xl shadow-lg w-80 max-w-[90vw] border border-gray-100">

      {/* 1. Search */}
      <div className="mb-4 relative">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Vyhledávání
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Hledat ulici..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <span className="absolute right-3 top-2.5 text-gray-400 pointer-events-none">
            {isSearchLoading
              ? <span className="text-xs">...</span>
              : <Search className="w-4 h-4" />
            }
          </span>
        </div>
        {searchResults.length > 0 && (
          <ul className="absolute z-50 w-full bg-white border border-gray-100 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
            {searchResults.map((result) => (
              <li
                key={result.id}
                onClick={() => handleResultClick(result)}
                className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 border-b border-gray-50 last:border-0"
              >
                {result.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2. Vehicle Width */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Šířka vozidla
        </label>

        <div className="relative mb-2">
          <select
            value={selectedVehicleId}
            onChange={handleVehicleSelect}
            className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 truncate"
          >
            <option value="">— Zadat ručně —</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id} disabled={v.width == null}>
                {v.name}{v.width != null ? ` (${v.width} cm)` : " — bez šířky"}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="range"
              min="150"
              max="500"
              step="1"
              value={vehicleWidth}
              onChange={handleSliderChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>150 cm</span>
              <span>500 cm</span>
            </div>
          </div>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
            <input
              type="number"
              min="150"
              max="500"
              step="1"
              value={widthInput}
              onChange={handleWidthInputChange}
              onBlur={handleWidthInputBlur}
              onKeyDown={handleWidthInputKeyDown}
              className="w-14 px-2 py-1.5 text-sm text-right focus:outline-none"
            />
            <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 py-1.5 select-none">
              cm
            </span>
          </div>
        </div>
      </div>

      {/* 3. Data Source */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Zdroj dat
        </label>
        <div className="flex bg-gray-100 p-1 rounded-lg mb-3">
          <button
            onClick={handleLatestClick}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              isLiveMode
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Aktuální
          </button>
          <button
            onClick={handleHistoryClick}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              !isLiveMode
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Historie
          </button>
        </div>

        {!isLiveMode && (
          <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="w-full flex justify-between items-center px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <span>{formatDisplayDate(selectedDate)}</span>
              <CalendarIcon className="w-4 h-4 text-gray-400" />
            </button>

            {showCalendar && (
              <div className="absolute top-full left-0 mt-2 w-auto bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                <Calendar
                  mode="single"
                  selected={new Date(selectedDate)}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(format(date, "yyyy-MM-dd"));
                      setShowCalendar(false);
                    }
                  }}
                  modifiers={{
                    hasData: (date) =>
                      availableDates.some((d) => d === format(date, "yyyy-MM-dd")),
                  }}
                  modifiersClassNames={{
                    hasData:
                      "font-bold rounded-md !bg-green-100 text-green-800 aria-selected:!bg-green-900 aria-selected:!text-white",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {isLiveMode && (
          <p className="text-xs text-gray-400 text-center">
            Data z {formatDisplayDate(mapDate)}
          </p>
        )}
      </div>

      {/* 4. Route Finder */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Navigace
          </label>
          {routingMode && (
            <button
              onClick={onClearRoute}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
              Smazat
            </button>
          )}
        </div>

        <button
          onClick={onToggleRouting}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            routingMode
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          <Navigation className="w-4 h-4" />
          {routingMode ? "Navigace aktivní" : "Hledat trasu"}
        </button>

        {routingMode && (
          <div className="mt-3 space-y-2">
            {/* Start — address search with stations pinned at top of dropdown */}
            <RouteSearchInput
              placeholder="Odkud…"
              value={startSearch.query}
              onChange={startSearch.setQuery}
              results={startSearch.results}
              loading={startSearch.loading}
              onSelect={handleStartSelect}
              dotColor="bg-green-500"
              pinnedResults={stations}
              onSelectPinned={(s) => {
                startSetByInput.current = true;
                startSearch.setQuerySelected(s.name);
                startSearch.setResults([]);
                onSetRouteStart(s.lat, s.lon);
              }}
            />

            {/* End address search */}
            <RouteSearchInput
              placeholder="Kam…"
              value={endSearch.query}
              onChange={endSearch.setQuery}
              results={endSearch.results}
              loading={endSearch.loading}
              onSelect={handleEndSelect}
              dotColor="bg-red-500"
            />

            {/* Status */}
            <div className="text-xs text-gray-500 space-y-1 pt-1">
              {routeLoading && (
                <div className="flex items-center gap-1.5 text-blue-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Výpočet trasy…
                </div>
              )}
              {!routeLoading && !routeStart && (
                <p className="text-gray-400">Klikněte na mapu nebo zadejte adresu</p>
              )}
              {!routeLoading && routeDistance != null && (
                <p className="font-medium text-gray-700">
                  Trasa:{" "}
                  {routeDistance >= 1000
                    ? `${(routeDistance / 1000).toFixed(2)} km`
                    : `${routeDistance} m`}
                </p>
              )}
              {!routeLoading && routeError && (
                <p className="text-red-500">{routeError}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
