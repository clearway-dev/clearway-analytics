interface FloatingPanelProps {
  vehicleWidth: number;
  setVehicleWidth: (width: number) => void;
}

export default function FloatingPanel({ vehicleWidth, setVehicleWidth }: FloatingPanelProps) {
  return (
    <div className="absolute top-4 left-4 z-[1000] bg-white p-4 rounded-xl shadow-lg w-80 max-w-[90vw] border border-gray-100">
      
      {/* 1. Search Input */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Search Location
        </label>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search street..." 
            className="w-full pl-3 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <span className="absolute right-3 top-2.5 text-gray-400">🔍</span>
        </div>
      </div>

      {/* 2. Vehicle Configuration (Slider) */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Vehicle Width
            </label>
            <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{vehicleWidth} cm</span>
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
            <button className="flex-1 py-1.5 text-xs font-medium bg-white text-gray-800 shadow-sm rounded-md transition-all">
                Live
            </button>
            <button className="flex-1 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-all">
                History
            </button>
        </div>
      </div>

    </div>
  );
}