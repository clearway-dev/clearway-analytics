import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Map, LayoutDashboard, Truck, MapPin, Download, Users, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { useAuth } from "../contexts/AuthContext";

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
    isActive
      ? "bg-blue-50 text-blue-600"
      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  );

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }


  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-none z-20">
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <div className="w-8 h-8 mr-3 flex-none">
            <img src="/clearway.png" alt="ClearWay" className="w-full h-full object-cover" />
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">ClearWay</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink to="/" className={NAV_LINK_CLASS}>
            <Map className="w-5 h-5 mr-3" />
            Mapa
          </NavLink>

          <NavLink to="/dashboard" className={NAV_LINK_CLASS}>
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Přehled
          </NavLink>

          <NavLink to="/vehicles" className={NAV_LINK_CLASS}>
            <Truck className="w-5 h-5 mr-3" />
            Vozidla IZS
          </NavLink>

          <NavLink to="/stations" className={NAV_LINK_CLASS}>
            <MapPin className="w-5 h-5 mr-3" />
            Stanice
          </NavLink>

          <NavLink to="/export" className={NAV_LINK_CLASS}>
            <Download className="w-5 h-5 mr-3" />
            Exporty
          </NavLink>

          {isAdmin && (
            <NavLink to="/users" className={NAV_LINK_CLASS}>
              <Users className="w-5 h-5 mr-3" />
              Správa uživatelů
            </NavLink>
          )}
        </nav>

        {/* Footer — user info + logout */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              isAdmin ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
            }`}>
              {isAdmin
                ? <ShieldCheck className="w-4 h-4" />
                : <UserIcon className="w-4 h-4" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">
                {user?.full_name ?? user?.email}
              </p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Odhlásit se"
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
