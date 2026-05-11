import { useState, useCallback, useRef, useEffect } from "react";
import { Download, Search, Trash2, Globe, Zap, CircleCheck as CheckCircle2, Circle as XCircle, CircleAlert as AlertCircle, Clock, RefreshCw } from "lucide-react";
import { type WhoisResult } from "@shared/schema";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "https://zpplojmjtfrwctmcwojt.supabase.co";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwcGxvam1qdGZyd2N0bWN3b2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzMzMDksImV4cCI6MjA5NDA0OTMwOX0.GT3ikTRnjjbwmWj0cs37pZAPpo3akqW8kdUyAAbvpTY";

function parseDomains(input: string): string[] {
  return input
    .split(/[\n,\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""))
    .filter((d) => d.length > 0)
    .map((d) => (d.endsWith(".us") ? d.slice(0, -3) : d))
    .filter((d, i, arr) => arr.indexOf(d) === i);
}

function StatusBadge({ status }: { status: WhoisResult["status"] }) {
  switch (status) {
    case "found":
      return (
        <span className="badge-found inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium">
          <CheckCircle2 size={11} /> Found
        </span>
      );
    case "not_found":
      return (
        <span className="badge-not-found inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium">
          <XCircle size={11} /> Not Found
        </span>
      );
    case "error":
      return (
        <span className="badge-error inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium">
          <AlertCircle size={11} /> Error
        </span>
      );
    case "checking":
      return (
        <span className="badge-checking inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium">
          <RefreshCw size={11} className="animate-spin" /> Checking
        </span>
      );
    default:
      return (
        <span className="badge-pending inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium">
          <Clock size={11} /> Pending
        </span>
      );
  }
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }} className="rounded-lg px-4 py-3 flex flex-col gap-0.5 min-w-[80px]">
      <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
      <span className="text-xl font-bold mono" style={{ color }}>{value}</span>
    </div>
  );
}

export default function Home() {
  const [domainInput, setDomainInput] = useState("");
  const [results, setResults] = useState<WhoisResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<boolean>(false);

  const domains = parseDomains(domainInput);
  const domainCount = domains.length;

  const completedCount = results.filter((r) => ["found", "not_found", "error"].includes(r.status)).length;
  const foundCount = results.filter((r) => r.status === "found").length;
  const notFoundCount = results.filter((r) => r.status === "not_found").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleSearch = useCallback(async () => {
    const domList = parseDomains(domainInput);
    if (domList.length === 0) return;

    abortRef.current = false;
    setIsSearching(true);
    setProcessedCount(0);
    setTotalCount(domList.length);

    const initialResults: WhoisResult[] = domList.map((d) => ({
      domain: `${d}.us`,
      status: "pending",
      expiresOn: null,
      registrar: null,
      registrantName: null,
      registrantOrg: null,
      email: null,
      errorMessage: null,
    }));
    setResults(initialResults);

    // Process in parallel batches of 3 for speed without overwhelming
    const BATCH = 3;
    let processed = 0;

    for (let i = 0; i < domList.length; i += BATCH) {
      if (abortRef.current) break;
      const batch = domList.slice(i, i + BATCH);
      const batchIndexes = batch.map((_, j) => i + j);

      // Mark batch as checking
      setResults((prev) =>
        prev.map((r, idx) => batchIndexes.includes(idx) ? { ...r, status: "checking" } : r)
      );

      await Promise.all(
        batch.map(async (domain, j) => {
          const idx = i + j;
          try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/whois-lookup`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                "Apikey": SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({ domain: `${domain}.us` }),
            });
            const data = await res.json();
            setResults((prev) =>
              prev.map((r, i2) =>
                i2 === idx ? {
                  ...r,
                  status: data.status,
                  expiresOn: data.expiresOn,
                  registrar: data.registrar,
                  registrantName: data.registrantName ?? null,
                  registrantOrg: data.registrantOrg ?? null,
                  email: data.email,
                  errorMessage: data.errorMessage,
                } : r
              )
            );
          } catch {
            setResults((prev) =>
              prev.map((r, i2) => i2 === idx ? { ...r, status: "error", errorMessage: "Request failed" } : r)
            );
          }
          processed++;
          setProcessedCount(processed);
        })
      );
    }

    setIsSearching(false);
  }, [domainInput]);

  const handleStop = () => {
    abortRef.current = true;
  };

  const handleClear = () => {
    abortRef.current = true;
    setDomainInput("");
    setResults([]);
    setProcessedCount(0);
    setTotalCount(0);
    setIsSearching(false);
  };

  const downloadCSV = () => {
    const rows = results.filter((r) => r.status === "found" || r.status === "not_found");
    if (rows.length === 0) return;

    // Convert "example.us" → "Example.com" (capitalize first letter, swap TLD)
    const formatDomain = (d: string) => {
      const base = d.replace(/\.us$/i, "");
      const capitalized = base.charAt(0).toUpperCase() + base.slice(1);
      return `${capitalized}.com`;
    };

    const csv = [
      ["Domain", "Status", "Expires On", "Registrar", "Registrant Name", "Registrant Org", "Registrant Email"].join(","),
      ...rows.map((r) =>
        [
          formatDomain(r.domain),
          r.status,
          r.expiresOn || "",
          r.registrar || "",
          r.registrantName || "",
          r.registrantOrg || "",
          r.email || "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `whois-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const hasResults = results.length > 0;
  useEffect(() => {
    if (hasResults && tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hasResults]);

  return (
    <div className="min-h-screen grid-bg" style={{ background: "var(--surface)" }}>
      {/* Scan line effect */}
      <div className="scanline" />

      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--line)", background: "rgba(15,17,23,0.8)" }} className="sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="logo-mark">
              <Globe size={16} style={{ color: "var(--cyan)" }} />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
                Domain Scout
              </span>
              <span className="text-xs ml-2 mono" style={{ color: "hsl(var(--muted-foreground))" }}>.us WHOIS</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="pulse-dot" />
            <span className="text-xs mono" style={{ color: "hsl(var(--muted-foreground))" }}>live</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* Hero */}
        <div className="fade-in mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4 mono"
            style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.18)", color: "var(--cyan)" }}>
            <Zap size={11} /> Parallel RDAP + WHOIS lookups · No API key required
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: "hsl(var(--foreground))" }}>
            Bulk .us Domain{" "}
            <span className="glow-text" style={{ color: "var(--cyan)" }}>WHOIS Scout</span>
          </h1>
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Look up registration details, expiry dates, and contact emails for multiple .us domains at once
          </p>
        </div>

        {/* Input card */}
        <div className="fade-in fade-in-delay-1 input-card rounded-xl mb-6 transition-all"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b" style={{ borderColor: "var(--line)" }}>
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Domain Input</span>
            <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(14,165,233,0.1)", color: "var(--cyan)", border: "1px solid rgba(14,165,233,0.2)" }}>
              {domainCount} domain{domainCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="p-5 space-y-4">
            <textarea
              className="domain-input w-full rounded-lg p-3"
              style={{ height: "140px" }}
              placeholder={"example\nmydomain\ntestsite\n\n# One per line or comma-separated, .us added automatically"}
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              disabled={isSearching}
              data-testid="input-domains"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs mono" style={{ color: "hsl(var(--muted-foreground))" }} data-testid="text-domain-count">
                {domainCount > 0 ? `${domainCount} unique domain${domainCount !== 1 ? "s" : ""} ready` : "Enter domains above"}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClear}
                  disabled={domainInput === "" && results.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--line)", color: "hsl(var(--muted-foreground))" }}
                  data-testid="button-clear"
                >
                  <Trash2 size={14} /> Clear
                </button>
                {isSearching ? (
                  <button
                    onClick={handleStop}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
                  >
                    <XCircle size={14} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={handleSearch}
                    disabled={domainCount === 0}
                    className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    data-testid="button-search"
                  >
                    <Search size={14} /> Start Search
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {isSearching && (
          <div className="fade-in mb-6 rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>
                Scanning domains...
              </span>
              <span className="mono text-xs" style={{ color: "var(--cyan)" }}>
                {processedCount} / {totalCount} · {progressPct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
              <div
                className="h-full rounded-full progress-shimmer transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats row */}
        {results.length > 0 && (
          <div className="fade-in flex flex-wrap items-center gap-3 mb-5">
            <StatCard label="Total" value={results.length} color="hsl(var(--foreground))" />
            <StatCard label="Found" value={foundCount} color="var(--green)" />
            <StatCard label="Not Found" value={notFoundCount} color="#94a3b8" />
            {errorCount > 0 && <StatCard label="Error" value={errorCount} color="var(--red)" />}
            <div className="flex-1" />
            {(foundCount > 0 || notFoundCount > 0) && !isSearching && (
              <button
                onClick={downloadCSV}
                disabled={foundCount === 0 && notFoundCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)", color: "var(--cyan)" }}
                data-testid="button-download"
              >
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div ref={tableRef} className="fade-in rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>#</th>
                    <th style={{ textAlign: "left" }}>Domain</th>
                    <th style={{ textAlign: "left" }}>Status</th>
                    <th style={{ textAlign: "left" }}>Expires</th>
                    <th style={{ textAlign: "left" }}>Registrar</th>
                    <th style={{ textAlign: "left" }}>Registrant</th>
                    <th style={{ textAlign: "left" }}>Registrant Email</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={r.domain} className="row-animate" style={{ animationDelay: `${Math.min(idx * 30, 200)}ms` }} data-testid={`row-result-${r.domain}`}>
                      <td className="mono" style={{ color: "hsl(var(--muted-foreground))", width: "40px" }}>{idx + 1}</td>
                      <td className="mono font-medium" style={{ color: "hsl(var(--foreground))" }} data-testid={`text-domain-${r.domain}`}>
                        {r.domain}
                      </td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="mono text-xs" style={{ color: r.expiresOn ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }} data-testid={`text-expires-${r.domain}`}>
                        {r.expiresOn || "—"}
                      </td>
                      <td className="text-xs" style={{ color: r.registrar ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", maxWidth: "180px" }} data-testid={`text-registrar-${r.domain}`}>
                        <span className="truncate block" title={r.registrar || undefined}>{r.registrar || "—"}</span>
                      </td>
                      <td className="text-xs" style={{ color: (r.registrantName || r.registrantOrg) ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", maxWidth: "180px" }} data-testid={`text-registrant-${r.domain}`}>
                        <span className="truncate block" title={r.registrantOrg || r.registrantName || undefined}>
                          {r.registrantOrg || r.registrantName || "—"}
                        </span>
                      </td>
                      <td className="mono text-xs" style={{ color: r.email ? "var(--cyan)" : "hsl(var(--muted-foreground))", maxWidth: "220px" }} data-testid={`text-email-${r.domain}`}>
                        <span className="truncate block" title={r.email || undefined}>{r.email || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !isSearching && (
          <div className="fade-in fade-in-delay-2 rounded-xl p-12 text-center" style={{ border: "1px dashed var(--line)" }}>
            <div className="logo-mark mx-auto mb-4">
              <Search size={18} style={{ color: "var(--cyan)" }} />
            </div>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Enter .us domains above and hit <strong style={{ color: "hsl(var(--foreground))" }}>Start Search</strong>
            </p>
            <p className="text-xs mt-1 mono" style={{ color: "hsl(var(--muted-foreground))" }}>
              Queries RDAP · Who-Dat · WhoisJSON simultaneously
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 pb-8 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--line)", marginTop: "40px" }}>
        <span className="text-xs mono" style={{ color: "hsl(var(--muted-foreground))" }}>Domain Scout · .us WHOIS</span>
        <span className="text-xs mono" style={{ color: "hsl(var(--muted-foreground))" }}>RDAP · Who-Dat · WhoisJSON</span>
      </footer>
    </div>
  );
}
