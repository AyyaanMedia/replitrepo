import { useState } from "react";
import { Globe, Lock, Eye, EyeOff, Tag } from "lucide-react";

const PASSWORD = "9866222936";
const STORAGE_KEY = "ds_unlocked";

interface Props {
  children: React.ReactNode;
}

export default function LockScreen({ children }: Props) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [input, setInput] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [shake, setShake] = useState(false);
  const [error, setError] = useState(false);

  const attempt = () => {
    if (input === PASSWORD) {
      try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 600);
      setTimeout(() => setError(false), 2500);
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--surface)" }}
    >
      {/* Subtle grid bg */}
      <div className="grid-bg fixed inset-0 pointer-events-none" />
      <div className="scanline fixed inset-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="logo-mark mb-3" style={{ width: 48, height: 48 }}>
            <Globe size={22} style={{ color: "var(--cyan)" }} />
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
            Domain Scout
          </span>
          <span className="text-xs mono mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
            .us WHOIS Intelligence
          </span>
        </div>

        {/* For Sale badge */}
        <div
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl mb-6 text-sm font-semibold"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
            color: "var(--amber)",
          }}
        >
          <Tag size={15} />
          This website is for sale
        </div>

        {/* Lock card */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Lock size={14} style={{ color: "var(--cyan)" }} />
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Protected Access
            </span>
          </div>
          <p className="text-xs mb-5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Enter the password to access this tool
          </p>

          <div className={`relative mb-3 ${shake ? "animate-[wiggle_0.5s_ease]" : ""}`}>
            <input
              type={showPw ? "text" : "password"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && attempt()}
              placeholder="Password"
              autoFocus
              className="domain-input w-full rounded-lg px-4 py-3 pr-10 text-sm"
              style={error ? { borderColor: "var(--red)", boxShadow: "0 0 0 2px rgba(239,68,68,0.15)" } : {}}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={15} style={{ color: "hsl(var(--muted-foreground))" }} /> : <Eye size={15} style={{ color: "hsl(var(--muted-foreground))" }} />}
            </button>
          </div>

          {error && (
            <p className="text-xs mb-3" style={{ color: "var(--red)" }}>
              Incorrect password. Please try again.
            </p>
          )}

          <button
            onClick={attempt}
            disabled={!input}
            className="btn-primary w-full py-2.5 rounded-lg text-sm font-semibold text-white"
          >
            Unlock
          </button>
        </div>

        {/* Contact */}
        <div className="mt-5 text-center">
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Interested in purchasing?
          </p>
          <a
            href="mailto:shukurmediainc@gmail.com"
            className="text-xs font-medium mt-0.5 inline-block"
            style={{ color: "var(--cyan)" }}
          >
            shukurmediainc@gmail.com
          </a>
        </div>
      </div>

      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}