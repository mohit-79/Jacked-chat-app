import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import AppShell from "@/pages/AppShell";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FDFBF7] text-[#1A1A1A]">
        <div className="flex flex-col items-center gap-3 fade-in">
          <div className="w-10 h-10 border-[3px] border-[#1A1A1A] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#4A4A4A]">Loading...</span>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  // Handle Emergent OAuth callback (session_id in URL fragment) synchronously
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}
