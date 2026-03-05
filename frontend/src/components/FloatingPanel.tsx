import { useState, useEffect } from "react";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import { Search, CalendarIcon, ChevronDown, Navigation, X, Loader2 } from "lucide-react";
import type { LatLngTuple } from "leaflet";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface SearchResult {
  id: string;
  name: string;
  center_lat: number;
  center_lon: number;
}

interface VehicleOption {
  id: string;
  name: string;
  width: number | null; // cm
}

interface StationOption {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface FloatingPanelProps {
  vehicleWidth: number; // cm
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
  onSelectStationAsStart: (lat: number, lon: number) => void;
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
  onSelectStationAsStart,
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

  // Keep widthInput in sync when vehicleWidth changes from outside (e.g. vehicle select)
  useEffect(() => {
    setWidthInput(String(vehicleWidth));
  }, [vehicleWidth]);

  // Fetch vehicle list and station list once on mount
  useEffect(() => {
    fetch(`${API_URL}/api/vehicles/`)
      .then((r) => r.json())
      .then((data: VehicleOption[]) => setVehicles(data))
      .catch(() => setVehicles([]));

    fetch(`${API_URL}/api/stations/`)
      .then((r) => r.json())
      .then((data: StationOption[]) => setStations(data))
      .catch(() => setStations([]));
  }, []);

  // Debounced address search via Nominatim
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 3) {
        setIsSearchLoading(true);
        const params = new URLSearchParams({
          q: searchQuery,
          format: "json",
          limit: "6",
          addressdetails: "1",
          countrycodes: "cz",
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

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-white p-4 rounded-xl shadow-lg w-80 max-w-[90vw] border border-gray-100">

      {/* 1. Search */}
      <div className="mb-4 relative">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Search Location
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Search street..."
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
          Vehicle Width
        </label>

        {/* Vehicle selector */}
        <div className="relative mb-2">
          <select
            value={selectedVehicleId}
            onChange={handleVehicleSelect}
            className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 truncate"
          >
            <option value="">— Set width manually —</option>
            {vehicles.map((v) => (
              <option
                key={v.id}
                value={v.id}
                disabled={v.width == null}
              >
                {v.name}{v.width != null ? ` (${v.width} cm)` : " — no width"}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Slider + number input */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="150"
            max="500"
            step="1"
            value={vehicleWidth}
            onChange={handleSliderChange}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
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
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>150 cm</span>
          <span>500 cm</span>
        </div>
      </div>

      {/* 3. Data Source */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Data Source
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
            Latest
          </button>
          <button
            onClick={handleHistoryClick}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              !isLiveMode
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            History
          </button>
        </div>

        {/* Current date display (always visible) */}
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
            Showing data from {formatDisplayDate(mapDate)}
          </p>
        )}
      </div>

      {/* 4. Route Finder */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Route Finder
          </label>
          {routingMode && (
            <button
              onClick={onClearRoute}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
              Clear
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
          {routingMode ? "Routing active" : "Find Route"}
        </button>

        {/* Station as route start */}
        {stations.length > 0 && (
          <div className="relative mt-2">
            <select
              defaultValue=""
              onChange={(e) => {
                const station = stations.find((s) => s.id === e.target.value);
                if (station) {
                  onSelectStationAsStart(station.lat, station.lon);
                  e.target.value = "";
                }
              }}
              className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 truncate"
            >
              <option value="" disabled>Start ze stanice…</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        )}

        {/* Status */}
        {routingMode && (
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            {routeLoading && (
              <div className="flex items-center gap-1.5 text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                Calculating route…
              </div>
            )}
            {!routeLoading && !routeStart && (
              <p className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                Click start point on map
              </p>
            )}
            {!routeLoading && routeStart && !routeEnd && (
              <p className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                Click end point on map
              </p>
            )}
            {!routeLoading && routeDistance != null && (
              <p className="font-medium text-gray-700">
                Route: {routeDistance >= 1000
                  ? `${(routeDistance / 1000).toFixed(2)} km`
                  : `${routeDistance} m`}
              </p>
            )}
            {!routeLoading && routeError && (
              <p className="text-red-500">{routeError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
