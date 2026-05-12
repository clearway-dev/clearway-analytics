import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import apiClient from "../lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: "admin" | "dispatcher";
  is_active: boolean;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    sessionStorage.getItem("access_token")
  );
  // Lazy init: start loading only when there's a token to validate
  const [isLoading, setIsLoading] = useState(() => !!sessionStorage.getItem("access_token"));

  // On mount: validate stored token and restore user state
  useEffect(() => {
    const storedToken = sessionStorage.getItem("access_token");
    if (!storedToken) {
      return;
    }
    apiClient
      .get<User>("/api/v1/auth/users/me")
      .then((res) => {
        setUser(res.data);
        setToken(storedToken);
      })
      .catch(() => {
        // Token is invalid or expired — clear it
        sessionStorage.removeItem("access_token");
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // OAuth2 password flow requires application/x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append("username", email);
    params.append("password", password);

    const tokenRes = await apiClient.post<{ access_token: string; token_type: string }>(
      "/api/v1/auth/login/access-token",
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const newToken = tokenRes.data.access_token;
    sessionStorage.setItem("access_token", newToken);
    setToken(newToken);

    const meRes = await apiClient.get<User>("/api/v1/auth/users/me", {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    setUser(meRes.data);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("access_token");
    setToken(null);
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    isAdmin: user?.role === "admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
