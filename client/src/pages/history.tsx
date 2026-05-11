import { useState, useEffect } from "react";
import { Download, Calendar, ChevronDown, ChevronUp, Trash2, ChartBar as BarChart2, CreditCard, Globe } from "lucide-react";
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
  session_id: string;
  looked_up_at: string;
}

interface UsageRow {
  used_date: string;
  key_index: number;
  credits_used: number;
}

function groupByDate(rows: HistoryRow[]): Record<string, HistoryRow[]> {
  return rows.reduce((acc, row) => {
    const date = row.looked_up_at.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(row);
    return acc;
  }, {} as Record<string, HistoryRow[]>);
}

function formatDisplayDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function formatDomainCom(d: string) {
  const base = d.replace(/\.us$/i, "");
  return base.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("-") + ".com";
}

function downloadCSVForDate(date: string, rows: HistoryRow[]) {
  const csv = [
    ["Domain (.com)", "Status", "Expires On", "Registrar", "Registrant Name", "Registrant Org", "Email"].join(","),
    ...rows.map((r) =>
      [formatDomainCom(r.domain), r.status, r.expires_on || "", r.registrar || "", r.registrant_name || "", r.registrant_org || "", r.email || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = `whois-${date}.csv`;
  a.click();
}

export default function History() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      };

      const [histRes, usageRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/lookup_history?select=*&order=looked_up_at.desc&limit=5000`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/api_usage?select=*&order=used_date.desc&limit=90`, { headers }),
      ]);

      if (histRes.ok) setHistory(await histRes.json());
      if (usageRes.ok) setUsage(await usageRes.json());
      setLoading(false);
    }
    load();
  }, []);

  const byDate = groupByDate(history);
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  // Daily credit totals
  const dailyCredits: Record<string, number> = {};
  for (const u of usage) {
    dailyCredits[u.used_date] = (dailyCredits[u.used_date] || 0) + u.credits_used;
  }

  // Monthly credit totals
  const monthlyCredits: Record<string, number> = {};
  for (const u of usage) {
    const month = u.used_date.slice(0, 7);
    monthlyCredits[month] = (monthlyCredits[month] || 0) + u.credits_used;
  }

  const thisMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const todayCredits = dailyCredits[today] || 0;
  const monthCredits = monthlyCredits[thisMonth] || 0;
  const totalLookups = history.length;

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
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
              <span className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "rgba(14,165,233,0.1)", color: "var(--cyan)", border: "1px solid rgba(14,165,233,0.2)" }}>History</span>
              <Link href="/reverse" className="nav-link text-xs px-3 py-1.5 rounded-md font-medium no-underline" style={{ color: "hsl(var(--muted-foreground))" }}>Reverse WHOIS</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="fade-in mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "hsl(var(--foreground))" }}>
            Lookup <span style={{ color: "var(--cyan)" }}>History</span>
          </h1>
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>7-day rolling history · Download by date · API credit tracking</p>
        </div>

        {/* Usage summary cards */}
        <div className="fade-in grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 size={14} style={{ color: "var(--cyan)" }} />
              <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Today's Lookups</span>
            </div>
            <span className="text-2xl font-bold mono" style={{ color: "hsl(var(--foreground))" }}>{byDate[today]?.length || 0}</span>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={14} style={{ color: "var(--amber)" }} />
              <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Credits Today</span>
            </div>
            <span className="text-2xl font-bold mono" style={{ color: "var(--amber)" }}>{todayCredits}</span>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} style={{ color: "var(--green)" }} />
              <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Credits This Month</span>
            </div>
            <span className="text-2xl font-bold mono" style={{ color: "var(--green)" }}>{monthCredits}</span>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Globe size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
              <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>7-Day Total</span>
            </div>
            <span className="text-2xl font-bold mono" style={{ color: "hsl(var(--foreground))" }}>{totalLookups}</span>
          </div>
        </div>

        {/* Daily credit usage bar chart */}
        {Object.keys(dailyCredits).length > 0 && (
          <div className="fade-in mb-8 rounded-xl p-5" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Daily API Credits Used</span>
              <span className="text-xs mono" style={{ color: "hsl(var(--muted-foreground))" }}>Last 7 days</span>
            </div>
            <DailyChart dailyCredits={dailyCredits} />
          </div>
        )}

        {/* History by date */}
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: "var(--line)", borderTopColor: "var(--cyan)" }} />
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading history...</p>
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="rounded-xl p-12 text-center" style={{ border: "1px dashed var(--line)" }}>
            <Calendar size={24} className="mx-auto mb-3" style={{ color: "hsl(var(--muted-foreground))" }} />
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No lookup history yet. Run a scan to see results here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedDates.map((date) => {
              const rows = byDate[date];
              const expanded = expandedDates.has(date);
              const credits = dailyCredits[date] || 0;
              const found = rows.filter((r) => r.status === "found").length;
              const notFound = rows.filter((r) => r.status === "not_found").length;

              return (
                <div key={date} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                  {/* Date header row */}
                  <div
                    className="flex items-center justify-between px-5 py-3 cursor-pointer transition-colors"
                    style={{ background: "var(--surface-2)" }}
                    onClick={() => toggleDate(date)}
                  >
                    <div className="flex items-center gap-3">
                      <button className="p-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>{formatDisplayDate(date)}</span>
                      <div className="flex items-center gap-2">
                        <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(14,165,233,0.1)", color: "var(--cyan)", border: "1px solid rgba(14,165,233,0.15)" }}>
                          {rows.length} lookups
                        </span>
                        {found > 0 && (
                          <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "var(--green)", border: "1px solid rgba(34,197,94,0.2)" }}>
                            {found} found
                          </span>
                        )}
                        {credits > 0 && (
                          <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.2)" }}>
                            {credits} credits
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadCSVForDate(date, rows); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)", color: "var(--cyan)" }}
                    >
                      <Download size={12} /> CSV
                    </button>
                  </div>

                  {/* Expanded rows */}
                  {expanded && (
                    <div className="overflow-x-auto">
                      <table className="data-table w-full">
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>Domain</th>
                            <th style={{ textAlign: "left" }}>Status</th>
                            <th style={{ textAlign: "left" }}>Expires</th>
                            <th style={{ textAlign: "left" }}>Registrar</th>
                            <th style={{ textAlign: "left" }}>Email</th>
                            <th style={{ textAlign: "left" }}>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id}>
                              <td className="mono text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>{r.domain}</td>
                              <td>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.status === "found" ? "badge-found" : r.status === "not_found" ? "badge-not-found" : "badge-error"}`}>
                                  {r.status === "found" ? "Found" : r.status === "not_found" ? "Not Found" : "Error"}
                                </span>
                              </td>
                              <td className="mono text-xs" style={{ color: r.expires_on ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>{r.expires_on || "—"}</td>
                              <td className="text-xs" style={{ color: "hsl(var(--muted-foreground))", maxWidth: "160px" }}>
                                <span className="truncate block" title={r.registrar || undefined}>{r.registrar || "—"}</span>
                              </td>
                              <td className="mono text-xs" style={{ color: r.email ? "var(--cyan)" : "hsl(var(--muted-foreground))", maxWidth: "200px" }}>
                                <span className="truncate block" title={r.email || undefined}>{r.email || "—"}</span>
                              </td>
                              <td className="mono text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                                {new Date(r.looked_up_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function DailyChart({ dailyCredits }: { dailyCredits: Record<string, number> }) {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  const max = Math.max(...days.map((d) => dailyCredits[d] || 0), 1);

  return (
    <div className="flex items-end gap-2 h-24">
      {days.map((d) => {
        const val = dailyCredits[d] || 0;
        const pct = Math.max((val / max) * 100, val > 0 ? 4 : 0);
        const isToday = d === new Date().toISOString().slice(0, 10);
        const label = new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return (
          <div key={d} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs mono" style={{ color: "var(--cyan)", visibility: val > 0 ? "visible" : "hidden" }}>{val}</span>
            <div className="w-full rounded-t transition-all duration-500" style={{
              height: `${pct}%`,
              minHeight: val > 0 ? "4px" : "0",
              background: isToday ? "var(--cyan)" : "rgba(14,165,233,0.35)",
            }} />
            <span className="text-xs mono" style={{ color: isToday ? "var(--cyan)" : "hsl(var(--muted-foreground))", fontSize: "10px" }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
