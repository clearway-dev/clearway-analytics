import MapComponent from './components/MapComponent';

function App() {
  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
      {/* Horní lišta (Header) */}
      <header style={{ 
          padding: "1rem", 
          background: "#2c3e50", 
          color: "white", 
          boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
          zIndex: 1000 
      }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>ClearWay Analytics 🚛</h1>
      </header>

      {/* Hlavní obsah s mapou */}
      <div style={{ flex: 1, position: "relative" }}>
        <MapComponent />
      </div>
    </div>
  )
}

export default App