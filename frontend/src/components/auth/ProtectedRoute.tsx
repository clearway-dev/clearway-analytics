import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

interface ProtectedRouteProps {
  /** If set, only users with this role may access the route. */
  requiredRole?: "admin" | "dispatcher";
  /** Where to redirect if role check fails. Defaults to "/". */
  unauthorizedRedirect?: string;
}

export default function ProtectedRoute({
  requiredRole,
  unauthorizedRedirect = "/",
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Načítám…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={unauthorizedRedirect} replace />;
  }

  return <Outlet />;
}
