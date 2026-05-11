import { useState } from "react";
import { Search, Download, Globe, Mail } from "lucide-react";
import { Link } from "wouter";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "https://zpplojmjtfrwctmcwojt.supabase.co";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwcGxvam1qdGZyd2N0bWN3b2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzMzMDksImV4cCI6MjA5NDA0OTMwOX0.GT3ikTRnjjbwmWj0cs37pZAPpo3akqW8kdUyAAbvpTY";

interface HistoryRow {
  id: string;
  domain: string;
  status: string;
  expires_on: string | null;
  registrar: string | null;
  registrant_name: string | null;
  registrant_org: string | null;
  email: string | null;
  looked_up_at: string;
}

function formatDomainCom(d: string) {
  const base = d.replace(/\.us$/i, "");
  return base.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("-") + ".com";
}

export default function ReverseWhois() {
  const [emailInput, setEmailInput] = useState("");
  const [results, setResults] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchedEmail, setSearchedEmail] = useState("");

  const handleSearch = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setLoading(true);
    setSearched(false);

    const headers = {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    };

    // Search by exact email match — deduplicate by domain, keep latest
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lookup_history?select=*&email=ilike.${encodeURIComponent(email)}&status=eq.found&order=looked_up_at.desc&limit=1000`,
      { headers }
    );

    if (res.ok) {
      const rows: HistoryRow[] = await res.json();
      // Deduplicate: keep latest entry per domain
      const seen = new Set<string>();
      const deduped = rows.filter((r) => {
        if (seen.has(r.domain)) return false;
        seen.add(r.domain);
        return true;
      });
      setResults(deduped);
    } else {
      setResults([]);
    }

    setSearchedEmail(email);
    setSearched(true);
    setLoading(false);
  };

  const downloadCSV = () => {
    if (results.length === 0) return;
    const csv = [
      ["Domain (.com)", "Domain (.us)", "Expires On", "Registrar", "Registrant Name", "Registrant Org", "Email", "Last Seen"].join(","),
      ...results.map((r) =>
        [
          formatDomainCom(r.domain),
          r.domain,
          r.expires_on || "",
          r.registrar || "",
          r.registrant_name || "",
          r.registrant_org || "",
          r.email || "",
          r.looked_up_at.slice(0, 10),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `reverse-whois-${searchedEmail.replace(/@/g, "_at_")}.csv`;
    a.click();
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
            <Mail size={11} /> Search domains by registrant email
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "hsl(var(--foreground))" }}>
            Reverse <span style={{ color: "var(--cyan)" }}>WHOIS</span>
          </h1>
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Find all .us domains registered under a specific email address from your lookup history
          </p>
        </div>

        {/* Search input */}
        <div className="fade-in fade-in-delay-1 rounded-xl mb-6" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "var(--line)" }}>
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Email Address</span>
          </div>
          <div className="p-5">
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
            <p className="text-xs mt-2 mono" style={{ color: "hsl(var(--muted-foreground))" }}>
              Searches across all domains in your 7-day lookup history
            </p>
          </div>
        </div>

        {/* Results */}
        {searched && (
          <div className="fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  Results for <span style={{ color: "var(--cyan)" }}>{searchedEmail}</span>
                </span>
                <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(14,165,233,0.1)", color: "var(--cyan)", border: "1px solid rgba(14,165,233,0.15)" }}>
                  {results.length} domain{results.length !== 1 ? "s" : ""}
                </span>
              </div>
              {results.length > 0 && (
                <button
                  onClick={downloadCSV}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)", color: "var(--cyan)" }}
                >
                  <Download size={14} /> Export CSV
                </button>
              )}
            </div>

            {results.length === 0 ? (
              <div className="rounded-xl p-12 text-center" style={{ border: "1px dashed var(--line)" }}>
                <Mail size={24} className="mx-auto mb-3" style={{ color: "hsl(var(--muted-foreground))" }} />
                <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  No domains found for <strong style={{ color: "hsl(var(--foreground))" }}>{searchedEmail}</strong> in the last 7 days.
                </p>
                <p className="text-xs mt-1 mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Only domains from your scan history are searchable here.
                </p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                <div className="overflow-x-auto">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>#</th>
                        <th style={{ textAlign: "left" }}>Domain (.us)</th>
                        <th style={{ textAlign: "left" }}>Expires</th>
                        <th style={{ textAlign: "left" }}>Registrar</th>
                        <th style={{ textAlign: "left" }}>Registrant</th>
                        <th style={{ textAlign: "left" }}>Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, idx) => (
                        <tr key={r.id} className="row-animate" style={{ animationDelay: `${Math.min(idx * 20, 150)}ms` }}>
                          <td className="mono text-xs" style={{ color: "hsl(var(--muted-foreground))", width: "40px" }}>{idx + 1}</td>
                          <td className="mono text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>{r.domain}</td>
                          <td className="mono text-xs" style={{ color: r.expires_on ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                            {r.expires_on || "—"}
                          </td>
                          <td className="text-xs" style={{ color: "hsl(var(--muted-foreground))", maxWidth: "160px" }}>
                            <span className="truncate block" title={r.registrar || undefined}>{r.registrar || "—"}</span>
                          </td>
                          <td className="text-xs" style={{ color: "hsl(var(--muted-foreground))", maxWidth: "160px" }}>
                            <span className="truncate block" title={r.registrant_org || r.registrant_name || undefined}>
                              {r.registrant_org || r.registrant_name || "—"}
                            </span>
                          </td>
                          <td className="mono text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {r.looked_up_at.slice(0, 10)}
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

        {!searched && !loading && (
          <div className="fade-in fade-in-delay-2 rounded-xl p-12 text-center" style={{ border: "1px dashed var(--line)" }}>
            <div className="logo-mark mx-auto mb-4">
              <Mail size={18} style={{ color: "var(--cyan)" }} />
            </div>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Enter a registrant email above to find all domains registered under it
            </p>
            <p className="text-xs mt-1 mono" style={{ color: "hsl(var(--muted-foreground))" }}>
              Searches your 7-day scan history
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
