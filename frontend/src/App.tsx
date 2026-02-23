import { BrowserRouter, Routes, Route } from "react-router-dom";
import MapPage from "./pages/MapPage";
import AdminPage from "./pages/AdminPage";
import Layout from "./components/Layout";
import RoadNetworkMap from "./components/RoadNetworkMap";
import VehiclesPage from "./pages/VehiclesPage";
import StationsPage from "./pages/StationsPage";
import ExportPage from "./pages/ExportPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/network" element={<RoadNetworkMap />} />
        <Route element={<Layout />}>
          <Route path="/" element={<MapPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/stations" element={<StationsPage />} />
          <Route path="/export" element={<ExportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;