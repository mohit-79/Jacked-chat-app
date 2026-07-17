import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Home as HomeIcon, Zap, MessageCircle, Sparkles } from "lucide-react";
import { SignIn, SignUp } from "@clerk/react";

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get("mode") === "signup" ? "signup" : "signin";

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);

  return (
    <div className="min-h-screen w-full flex bg-[#FDFBF7]">
      {/* Hero Banner (Left Side) */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden" style={{
        backgroundImage: "url(https://images.pexels.com/photos/23241104/pexels-photo-23241104.jpeg)",
        backgroundSize: "cover", backgroundPosition: "center",
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
            <p className="text-lg opacity-90 leading-relaxed">Your home network's private chat & ultra-fast file transfer hub.</p>
            <div className="flex flex-col gap-3 mt-8">
              {[
                [Zap, "#A8E6CF", "Ultra-fast WebRTC transfer at home"],
                [Sparkles, "#FFD3B6", "Serverless signaling and Clerk auth"],
                [MessageCircle, "#E8DFF5", "Public, private & self-chat — your way"],
              ].map(([Icon, color, text]) => (
                <div key={text} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20">
                  <Icon size={20} style={{ color }} />
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Auth Panel (Right Side) */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md flex flex-col items-center">
          <div className="lg:hidden flex items-center gap-3 mb-8 self-start">
            <div className="w-12 h-12 bg-[#FFD3B6] border-2 border-[#1A1A1A] shadow-[4px_4px_0_#1A1A1A] rounded-2xl flex items-center justify-center">
              <HomeIcon className="text-[#1A1A1A]" size={24} strokeWidth={2.5} />
            </div>
            <span className="font-head font-black text-2xl tracking-tight">HomeNexus</span>
          </div>

          <div className="w-full flex justify-center scale-95 md:scale-100">
            {mode === "signin" ? (
              <SignIn 
                routing="hash"
                afterSignInUrl="/app"
                signUpUrl="/?mode=signup"
                appearance={{
                  elements: {
                    card: "border-2 border-[#1A1A1A] shadow-[8px_8px_0_#1A1A1A] rounded-2xl bg-white",
                    headerTitle: "font-head font-black text-2xl text-[#1A1A1A]",
                    headerSubtitle: "text-[#4A4A4A]",
                    socialButtonsBlockButton: "border-2 border-[#1A1A1A] shadow-[2px_2px_0_#1A1A1A] hover:bg-[#FDFBF7]",
                    formButtonPrimary: "bg-[#FFD3B6] border-2 border-[#1A1A1A] text-[#1A1A1A] shadow-[3px_3px_0_#1A1A1A] hover:bg-[#FFC099] font-bold text-sm",
                    formFieldInput: "border-2 border-[#1A1A1A] rounded-xl focus:ring-0 focus:border-[#FFD3B6]"
                  }
                }}
              />
            ) : (
              <SignUp 
                routing="hash"
                afterSignUpUrl="/app"
                signInUrl="/?mode=signin"
                appearance={{
                  elements: {
                    card: "border-2 border-[#1A1A1A] shadow-[8px_8px_0_#1A1A1A] rounded-2xl bg-white",
                    headerTitle: "font-head font-black text-2xl text-[#1A1A1A]",
                    headerSubtitle: "text-[#4A4A4A]",
                    socialButtonsBlockButton: "border-2 border-[#1A1A1A] shadow-[2px_2px_0_#1A1A1A] hover:bg-[#FDFBF7]",
                    formButtonPrimary: "bg-[#FFD3B6] border-2 border-[#1A1A1A] text-[#1A1A1A] shadow-[3px_3px_0_#1A1A1A] hover:bg-[#FFC099] font-bold text-sm",
                    formFieldInput: "border-2 border-[#1A1A1A] rounded-xl focus:ring-0 focus:border-[#FFD3B6]"
                  }
                }}
              />
            )}
          </div>

          <div className="mt-6 text-sm text-[#4A4A4A]">
            {mode === "signin" ? (
              <>
                Need an account?{" "}
                <button onClick={() => setSearchParams({ mode: "signup" })} className="font-bold underline text-[#1A1A1A]">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => setSearchParams({ mode: "signin" })} className="font-bold underline text-[#1A1A1A]">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
