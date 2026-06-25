import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { completeEmergentSession } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash;
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      navigate("/");
      return;
    }
    const sid = m[1];
    completeEmergentSession(sid)
      .then(() => {
        // Clean URL
        window.history.replaceState({}, document.title, "/app");
        navigate("/app", { replace: true });
      })
      .catch(() => {
        navigate("/");
      });
  }, [completeEmergentSession, navigate]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#FDFBF7]">
      <div className="text-center">
        <div className="font-head font-black text-3xl tracking-tight mb-2">Signing you in...</div>
        <div className="text-[#4A4A4A]">Just a moment</div>
      </div>
    </div>
  );
}
