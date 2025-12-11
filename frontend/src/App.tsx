import MapComponent from './components/MapComponent';

function App() {
  return (
    <div className="h-screen w-screen flex flex-col">
      {/* Horní lišta (Header) */}
      <header className="p-4 bg-slate-800 text-white shadow-lg z-[1000]">
        <h1 className="m-0 text-2xl font-semibold">ClearWay Analytics 🚛</h1>
      </header>

      {/* Hlavní obsah s mapou */}
      <div className="flex-1 relative">
        <MapComponent />
      </div>
    </div>
  )
}

export default App