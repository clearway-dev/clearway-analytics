import { NavLink, Outlet } from "react-router-dom";
import { Map, LayoutDashboard } from "lucide-react";
import { cn } from "../lib/utils";

export default function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-none z-20">
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
            <Map className="text-white h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">ClearWay</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn(
                "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )
            }
          >
            <Map className="w-5 h-5 mr-3" />
            Map View
          </NavLink>

          <NavLink
            to="/admin"
            className={({ isActive }) =>
              cn(
                "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )
            }
          >
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Dashboard
          </NavLink>
        </nav>

        {/* Footer / User Info (Optional placeholder) */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
              AD
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700">Admin User</p>
              <p className="text-xs text-gray-500">admin@clearway.com</p>
            </div>
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
