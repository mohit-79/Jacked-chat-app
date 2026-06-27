import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
const log = (...args) => console.log("[Auth]", ...args);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authingRef = useRef(false);

  const checkAuth = useCallback(async () => {
    if (window.location.hash?.includes("session_id=")) {
      log("skip checkAuth, OAuth callback in progress");
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("hn_token");
    if (!token) {
      log("checkAuth: no token");
      setLoading(false);
      return;
    }
    try {
      log("checkAuth: verifying token");
      const res = await api.get("/auth/me");
      if (!authingRef.current) setUser(res.data);
      log("checkAuth: valid", res.data?.user_id);
    } catch (e) {
      log("checkAuth: invalid", e?.response?.status);
      if (!authingRef.current) {
        localStorage.removeItem("hn_token");
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const loginWithPassword = async (email, password) => {
    authingRef.current = true;
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("hn_token", res.data.token);
      setUser(res.data.user);
      log("login: success", res.data.user?.user_id);
      return res.data.user;
    } catch (e) {
      log("login: failed", e?.response?.status);
      throw e;
    } finally {
      authingRef.current = false;
    }
  };

  const register = async (name, email, password) => {
    authingRef.current = true;
    try {
      log("register: creating account");
      const res = await api.post("/auth/register", { email, password, name });
      localStorage.setItem("hn_token", res.data.token);
      // Small delay so the token is committed to localStorage before setUser
      // triggers a re-render and any child API calls read it.
      await new Promise((r) => setTimeout(r, 50));
      setUser(res.data.user);
      log("register: success, auto-logged-in", res.data.user?.user_id);
      return res.data.user;
    } catch (e) {
      log("register: failed", e?.response?.status, e?.response?.data?.detail);
      throw e;
    } finally {
      authingRef.current = false;
    }
  };

  const completeEmergentSession = async (session_id) => {
    authingRef.current = true;
    try {
      const res = await api.post("/auth/session", { session_id });
      if (res.data.session_token) localStorage.setItem("hn_token", res.data.session_token);
      setUser(res.data.user);
      log("oauth: success", res.data.user?.user_id);
      return res.data.user;
    } catch (e) {
      log("oauth: failed", e?.response?.status);
      throw e;
    } finally {
      authingRef.current = false;
    }
  };

  const logout = async () => {
    log("logout");
    try { await api.post("/auth/logout"); } catch (e) { log("logout ignored", e?.message); }
    localStorage.removeItem("hn_token");
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch (e) { log("refreshUser failed", e?.response?.status); }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPassword, register, completeEmergentSession, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
