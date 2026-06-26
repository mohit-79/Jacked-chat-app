import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Home as HomeIcon, Zap, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { loginWithPassword, register, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Single source of truth for "go to app" — driven only by committed auth
  // state, never by the submit handler directly.
  useEffect(() => {
    if (user) {
      console.log("[Login] user present, navigating to /app", user.user_id);
      navigate("/app", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "login") {
        console.log("[Login] signing in", email);
        await loginWithPassword(email, password);
      } else {
        console.log("[Login] creating account", email);
        await register(name, email, password);
        // On successful register, show a welcome toast — navigation happens
        // automatically via the effect above once `user` is set in context.
        toast.success("Account created! Welcome 🎉");
      }
    } catch (err) {
      console.error("[Login] auth error", err?.response?.status, err?.response?.data);
      const detail = err.response?.data?.detail;
      // If the error suggests the account already exists, switch to login mode
      // and pre-fill so the user can just hit sign-in without re-typing.
      if (mode === "register" && (err.response?.status === 409 || (typeof detail === "string" && detail.toLowerCase().includes("exist")))) {
        toast.error("Account already exists — switching to sign-in for you.");
        setMode("login");
      } else {
        toast.error(detail || "Authentication failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/app";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen w-full flex bg-[#FDFBF7]">
      {/* Left visual panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden" style={{
        backgroundImage: "url(https://images.pexels.com/photos/23241104/pexels-photo-23241104.jpeg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>
        <div className="absolute inset-0 bg-gradient-to-tr from-[#1A1A1A]/60 via-transparent to-[#FFD3B6]/40" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFD3B6] border-2 border-[#1A1A1A] shadow-[4px_4px_0_#1A1A1A] rounded-2xl flex items-center justify-center">
              <HomeIcon className="text-[#1A1A1A]" size={24} strokeWidth={2.5} />
            </div>
            <span className="font-head font-black text-2xl tracking-tight">HomeNexus</span>
          </div>
          <div className="space-y-6 max-w-md">
            <h1 className="font-head font-black text-5xl tracking-tight leading-tight">
              Chat. Share. <span className="text-[#FFD3B6]">Beam files.</span>
            </h1>
            <p className="text-lg opacity-90 leading-relaxed">
              Your home network's private chat & ultra-fast file transfer hub. WebRTC for same-network speeds, cloud fallback when away.
            </p>
            <div className="flex flex-col gap-3 mt-8">
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20">
                <Zap size={20} className="text-[#A8E6CF]" />
                <span className="text-sm">Ultra-fast WebRTC transfer at home</span>
              </div>
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20">
                <Sparkles size={20} className="text-[#FFD3B6]" />
                <span className="text-sm">Stories that vanish in 24h</span>
              </div>
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20">
                <MessageCircle size={20} className="text-[#E8DFF5]" />
                <span className="text-sm">Public, private & self-chat — your way</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-[#FFD3B6] border-2 border-[#1A1A1A] shadow-[4px_4px_0_#1A1A1A] rounded-2xl flex items-center justify-center">
              <HomeIcon className="text-[#1A1A1A]" size={24} strokeWidth={2.5} />
            </div>
            <span className="font-head font-black text-2xl tracking-tight">HomeNexus</span>
          </div>

          <h2 className="font-head font-black text-4xl tracking-tight mb-2">
            {mode === "login" ? "Welcome back" : "Join the network"}
          </h2>
          <p className="text-[#4A4A4A] mb-8">
            {mode === "login" ? "Sign in to your home network" : "Create your home account"}
          </p>

          <button
            onClick={handleGoogle}
            data-testid="google-login-btn"
            className="w-full nb-btn bg-white rounded-xl py-3 px-4 font-semibold flex items-center justify-center gap-3 mb-4"
          >
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 8 3l5.7-5.7C34 6.5 29.3 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.5-.2-3-.4-4.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 18.9 13 24 13c3 0 5.8 1.1 8 3l5.7-5.7C34 6.5 29.3 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/><path fill="#4CAF50" d="M24 45.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.6 41 16.2 45.5 24 45.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.6l6.2 5.2C40.9 36.3 44.5 31 44.5 25c0-1.5-.2-3-.4-4.5z"/></svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-[2px] bg-[#1A1A1A]/10" />
            <span className="text-xs uppercase tracking-wider text-[#4A4A4A]">or</span>
            <div className="flex-1 h-[2px] bg-[#1A1A1A]/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold mb-1">Name</label>
                <input data-testid="register-name-input" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="nb-input" placeholder="Your name" />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold mb-1">Email</label>
              <input data-testid="auth-email-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="nb-input" placeholder="you@home.com" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Password</label>
              <input data-testid="auth-password-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="nb-input" placeholder="••••••••" />
            </div>
            <button
              type="submit"
              data-testid="auth-submit-btn"
              disabled={busy}
              className="w-full nb-btn bg-[#FFD3B6] hover:bg-[#FFC099] rounded-xl py-3 px-4 font-bold text-[#1A1A1A] disabled:opacity-50"
            >
              {busy ? "Please wait..." : (mode === "login" ? "Sign in" : "Create account")}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-[#4A4A4A]">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              data-testid="toggle-auth-mode-btn"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="font-bold underline underline-offset-4 text-[#1A1A1A]"
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
