import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

const log = (...args) => console.log("[Auth]", ...args);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tracks whether we are mid auth-mutation (login/register/session) so that
  // checkAuth() never overwrites a just-set user with a stale/late response.
  const authingRef = useRef(false);

  const checkAuth = useCallback(async () => {
    // If returning from OAuth callback, skip — AuthCallback will handle
    if (window.location.hash?.includes("session_id=")) {
      log("skip checkAuth, OAuth callback in progress");
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("hn_token");
    if (!token) {
      log("checkAuth: no token in storage, skipping /auth/me");
      setLoading(false);
      return;
    }
    try {
      log("checkAuth: verifying existing token");
      const res = await api.get("/auth/me");
      if (!authingRef.current) setUser(res.data);
      log("checkAuth: token valid", res.data?.user_id);
    } catch (e) {
      log("checkAuth: token invalid/expired", e?.response?.status);
      if (!authingRef.current) {
        localStorage.removeItem("hn_token");
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loginWithPassword = async (email, password) => {
    authingRef.current = true;
    try {
      log("login: submitting credentials");
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("hn_token", res.data.token);
      setUser(res.data.user);
      log("login: success", res.data.user?.user_id);
      return res.data.user;
    } catch (e) {
      log("login: failed", e?.response?.status, e?.response?.data?.detail);
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
      // IMPORTANT: store the token before setUser, and resolve only after
      // both are committed, so any consumer awaiting register() can safely
      // assume localStorage + context are already in sync (no redirect race).
      localStorage.setItem("hn_token", res.data.token);
      setUser(res.data.user);
      log("register: success, account auto-logged-in", res.data.user?.user_id);
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
      log("oauth: exchanging session_id");
      const res = await api.post("/auth/session", { session_id });
      if (res.data.session_token) {
        localStorage.setItem("hn_token", res.data.session_token);
      }
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
    try { await api.post("/auth/logout"); } catch (e) { log("logout: server call failed (ignored)", e?.message); }
    localStorage.removeItem("hn_token");
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch (e) {
      log("refreshUser: failed", e?.response?.status);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPassword, register, completeEmergentSession, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
