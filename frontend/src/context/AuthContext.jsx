import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useUser, useAuth as useClerkAuth } from "@clerk/react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
const log = (...args) => console.log("[Auth]", ...args);

export function AuthProvider({ children }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut } = useClerkAuth();
  
  const [dbUser, setDbUser] = useState(null);
  const [syncAttempted, setSyncAttempted] = useState(false);
  const pingingRef = useRef(false);

  // Parse Clerk user into the schema that HomeNexus expects
  const authUser = clerkUser ? {
    user_id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress || "",
    name: clerkUser.fullName || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress?.split("@")[0] || "User",
    picture: clerkUser.imageUrl || null,
    public_ip: dbUser?.publicIp || null,
    bio: dbUser?.bio || "",
    home_group: dbUser?.homeGroup || null
  } : null;

  // Function to register/ping user in backend database to record latest public IP
  const pingBackend = useCallback(async (userToPing) => {
    if (!userToPing || pingingRef.current) return;
    pingingRef.current = true;
    try {
      log("pinging backend to register/sync profile...", userToPing.user_id);
      const res = await api.post("/users/ping", {
        name: userToPing.name,
        email: userToPing.email,
        picture: userToPing.picture
      });
      log("backend sync successful, IP resolved to:", res.data?.publicIp);
      setDbUser(res.data);
    } catch (e) {
      log("backend sync failed:", e?.response?.status || e.message);
    } finally {
      pingingRef.current = false;
      setSyncAttempted(true);
    }
  }, []);

  useEffect(() => {
    if (clerkUser) {
      setSyncAttempted(false);
      pingBackend({
        user_id: clerkUser.id,
        name: clerkUser.fullName || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress?.split("@")[0] || "User",
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        picture: clerkUser.imageUrl || null
      });
    } else {
      setDbUser(null);
      setSyncAttempted(false);
    }
  }, [clerkUser, pingBackend]);

  const logout = async () => {
    log("logging out via Clerk...");
    try {
      await signOut();
      setDbUser(null);
    } catch (e) {
      log("logout failed", e.message);
    }
  };

  const refreshUser = async () => {
    if (clerkUser) {
      await pingBackend({
        user_id: clerkUser.id,
        name: clerkUser.fullName || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress?.split("@")[0] || "User",
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        picture: clerkUser.imageUrl || null
      });
    }
  };

  const loading = !isLoaded || (clerkUser && !syncAttempted);

  return (
    <AuthContext.Provider value={{ 
      user: authUser, 
      loading, 
      logout, 
      refreshUser,
      // mock placeholders for compatibility
      loginWithPassword: () => Promise.reject("Use Clerk component instead"),
      register: () => Promise.reject("Use Clerk component instead")
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
