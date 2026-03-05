import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import MapPage from "./pages/MapPage";
import AdminPage from "./pages/AdminPage";
import VehiclesPage from "./pages/VehiclesPage";
import StationsPage from "./pages/StationsPage";
import ExportPage from "./pages/ExportPage";
import UsersPage from "./pages/UsersPage";
import RoadNetworkMap from "./components/RoadNetworkMap";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Standalone map (no Layout shell) — still protected */}
          <Route element={<ProtectedRoute />}>
            <Route path="/network" element={<RoadNetworkMap />} />
          </Route>

          {/* Protected routes inside Layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<MapPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/stations" element={<StationsPage />} />
              <Route path="/export" element={<ExportPage />} />
              <Route element={<ProtectedRoute requiredRole="admin" />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
