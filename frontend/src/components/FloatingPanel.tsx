import { useState, useEffect } from "react";

interface SearchResult {
  id: string;
  name: string;
  center_lat: number;
  center_lon: number;
}

interface FloatingPanelProps {
  vehicleWidth: number;
  setVehicleWidth: (width: number) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  isLiveMode: boolean;
  setIsLiveMode: (isLive: boolean) => void;
  onSearchResultSelect: (lat: number, lon: number) => void;
}

export default function FloatingPanel({
  vehicleWidth,
  setVehicleWidth,
  selectedDate,
  setSelectedDate,
  isLiveMode,
  setIsLiveMode,
  onSearchResultSelect,
}: FloatingPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        
        fetch(`${apiUrl}/api/roads/search?q=${encodeURIComponent(searchQuery)}`)
          .then((res) => res.json())
          .then((data) => {
            setSearchResults(data);
            setIsLoading(false);
          })
          .catch((err) => {
            console.error("Search failed:", err);
            setIsLoading(false);
            setSearchResults([]);
          });
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleResultClick = (result: SearchResult) => {
    onSearchResultSelect(result.center_lat, result.center_lon);
    setSearchQuery(""); // Clear input
    setSearchResults([]); // Clear results
  };

  const handleLiveClick = () => {
    setIsLiveMode(true);
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-white p-4 rounded-xl shadow-lg w-80 max-w-[90vw] border border-gray-100">
      {/* 1. Search Input */}
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
            className="w-full pl-3 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <span className="absolute right-3 top-2.5 text-gray-400">
            {isLoading ? "..." : "🔍"}
          </span>
        </div>
        
        {/* Search Results Dropdown */}
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

      {/* 2. Vehicle Configuration (Slider) */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Vehicle Width
          </label>
          <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            {vehicleWidth} cm
          </span>
        </div>
        <input
          type="range"
          min="150"
          max="500"
          step="10"
          value={vehicleWidth}
          onChange={(e) => setVehicleWidth(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>1.5 m</span>
          <span>5.0 m</span>
        </div>
      </div>

      {/* 3. Time Filter (Toggle Placeholder) */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Data Source
        </label>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={handleLiveClick}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              isLiveMode
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Live (Today)
          </button>
          <button
            onClick={() => setIsLiveMode(false)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              !isLiveMode
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            History
          </button>
        </div>
        {/* Date Picker */}
        {!isLiveMode && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
