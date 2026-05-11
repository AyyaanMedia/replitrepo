import { useState } from "react";
import { Search, Download, Globe, Mail, CircleAlert as AlertCircle, Info } from "lucide-react";
import { Link } from "wouter";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "https://zpplojmjtfrwctmcwojt.supabase.co";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwcGxvam1qdGZyd2N0bWN3b2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzMzMDksImV4cCI6MjA5NDA0OTMwOX0.GT3ikTRnjjbwmWj0cs37pZAPpo3akqW8kdUyAAbvpTY";

interface Domain {
  domainName: string;
  date?: string;
  registrar?: string;
}

interface ReverseWhoisResult {
  source: "whoisxml" | "viewdns" | "none";
  email: string;
  count: number;
  domains: Domain[];
  error?: string;
}

export default function ReverseWhois() {
  const [emailInput, setEmailInput] = useState("");
  const [result, setResult] = useState<ReverseWhoisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"current" | "historic">("current");

  const handleSearch = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/reverse-whois`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, mode }),
      });
      const data: ReverseWhoisResult = await res.json();
      setResult(data);
    } catch {
      setResult({ source: "none", email, count: 0, domains: [], error: "Request failed" });
    }

    setLoading(false);
  };

  const downloadCSV = () => {
    if (!result || result.domains.length === 0) return;
    const csv = [
      ["Domain", "Registered Date", "Registrar"].join(","),
      ...result.domains.map((d) =>
        [d.domainName, d.date || "", d.registrar || ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `reverse-whois-${result.email.replace(/@/g, "_at_")}.csv`;
    a.click();
  };

  const sourceLabel: Record<string, string> = {
    whoisxml: "WhoisXML API",
    viewdns: "ViewDNS.info",
    none: "No source",
  };

  return (
    <div className="min-h-screen grid-bg" style={{ background: "var(--surface)" }}>
      <div className="scanline" />

      <header style={{ borderBottom: "1px solid var(--line)", background: "rgba(15,17,23,0.8)" }} className="sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <div className="logo-mark">
                <Globe size={16} style={{ color: "var(--cyan)" }} />
              </div>
              <span className="font-semibold text-sm tracking-tight" style={{ color: "hsl(var(--foreground))" }}>Domain Scout</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link href="/" className="nav-link text-xs px-3 py-1.5 rounded-md font-medium no-underline" style={{ color: "hsl(var(--muted-foreground))" }}>Lookup</Link>
              <Link href="/history" className="nav-link text-xs px-3 py-1.5 rounded-md font-medium no-underline" style={{ color: "hsl(var(--muted-foreground))" }}>History</Link>
              <span className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "rgba(14,165,233,0.1)", color: "var(--cyan)", border: "1px solid rgba(14,165,233,0.2)" }}>Reverse WHOIS</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="fade-in mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4 mono"
            style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.18)", color: "var(--cyan)" }}>
            <Mail size={11} /> Find all domains registered under an email
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "hsl(var(--foreground))" }}>
            Reverse <span style={{ color: "var(--cyan)" }}>WHOIS</span>
          </h1>
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Discover all domain names ever registered by a specific email address — across the entire internet
          </p>
        </div>

        {/* Search card */}
        <div className="fade-in fade-in-delay-1 rounded-xl mb-6" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "var(--line)" }}>
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Registrant Email</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
                <input
                  type="email"
                  className="domain-input w-full rounded-lg pl-9 pr-3 py-2.5 text-sm"
                  placeholder="registrant@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  disabled={loading}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!emailInput.trim() || loading}
                className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
              >
                <Search size={14} /> {loading ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Mode:</span>
              <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--surface-3)", border: "1px solid var(--line)" }}>
                {(["current", "historic"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="text-xs px-3 py-1 rounded-md font-medium transition-all capitalize"
                    style={mode === m
                      ? { background: "rgba(14,165,233,0.15)", color: "var(--cyan)", border: "1px solid rgba(14,165,233,0.25)" }
                      : { color: "hsl(var(--muted-foreground))", border: "1px solid transparent" }
                    }
                  >
                    {m === "current" ? "Current Registrations" : "Historic (all-time)"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="fade-in rounded-xl p-8 text-center" style={{ border: "1px solid var(--line)", background: "var(--surface-2)" }}>
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: "var(--line)", borderTopColor: "var(--cyan)" }} />
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Querying reverse WHOIS databases...</p>
            <p className="text-xs mono mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>This may take up to 20 seconds</p>
          </div>
        )}

        {/* Error */}
        {result && result.source === "none" && (
          <div className="fade-in rounded-xl p-5 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--red)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "#f87171" }}>Lookup failed</p>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{result.error || "Could not retrieve results. Please try again."}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && result.source !== "none" && (
          <div className="fade-in space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  Domains for <span style={{ color: "var(--cyan)" }}>{result.email}</span>
                </span>
                <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(14,165,233,0.1)", color: "var(--cyan)", border: "1px solid rgba(14,165,233,0.15)" }}>
                  {result.count.toLocaleString()} total found
                </span>
                {result.domains.length !== result.count && (
                  <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.08)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    {result.domains.length.toLocaleString()} returned
                  </span>
                )}
                <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface-3)", color: "hsl(var(--muted-foreground))", border: "1px solid var(--line)" }}>
                  via {sourceLabel[result.source]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {result.domains.length > 0 && (
                  <button
                    onClick={downloadCSV}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)", color: "var(--cyan)" }}
                  >
                    <Download size={14} /> Export CSV
                  </button>
                )}
              </div>
            </div>

            {/* Info note if count > returned */}
            {result.count > result.domains.length && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                <Info size={13} className="mt-0.5 shrink-0" style={{ color: "var(--amber)" }} />
                <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <span style={{ color: "var(--amber)" }}>{result.count.toLocaleString()} domains</span> are registered under this email.
                  {result.domains.length < result.count && ` Showing the first ${result.domains.length.toLocaleString()} results. To get all results, a paid WhoisXML API plan is required.`}
                </p>
              </div>
            )}

            {result.domains.length === 0 ? (
              <div className="rounded-xl p-12 text-center" style={{ border: "1px dashed var(--line)" }}>
                <Mail size={24} className="mx-auto mb-3" style={{ color: "hsl(var(--muted-foreground))" }} />
                <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  No domains found for <strong style={{ color: "hsl(var(--foreground))" }}>{result.email}</strong>
                </p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                <div className="overflow-x-auto">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>#</th>
                        <th style={{ textAlign: "left" }}>Domain</th>
                        <th style={{ textAlign: "left" }}>Registered</th>
                        <th style={{ textAlign: "left" }}>Registrar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.domains.map((d, idx) => (
                        <tr key={d.domainName + idx} className="row-animate" style={{ animationDelay: `${Math.min(idx * 15, 200)}ms` }}>
                          <td className="mono text-xs" style={{ color: "hsl(var(--muted-foreground))", width: "40px" }}>{idx + 1}</td>
                          <td className="mono text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>{d.domainName}</td>
                          <td className="mono text-xs" style={{ color: d.date ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                            {d.date || "—"}
                          </td>
                          <td className="text-xs" style={{ color: "hsl(var(--muted-foreground))", maxWidth: "200px" }}>
                            <span className="truncate block" title={d.registrar}>{d.registrar || "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="fade-in fade-in-delay-2 rounded-xl p-12 text-center" style={{ border: "1px dashed var(--line)" }}>
            <div className="logo-mark mx-auto mb-4">
              <Mail size={18} style={{ color: "var(--cyan)" }} />
            </div>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Enter a registrant email to find all domains registered under it
            </p>
            <p className="text-xs mt-1 mono" style={{ color: "hsl(var(--muted-foreground))" }}>
              Searches ViewDNS.info · WhoisXML across the entire domain registry
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
