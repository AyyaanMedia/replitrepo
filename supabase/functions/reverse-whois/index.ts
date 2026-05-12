import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Domain {
  domainName: string;
  date?: string;
  registrar?: string;
  country?: string;
}

interface Result {
  source: string;
  email: string;
  count: number;
  domains: Domain[];
  error?: string;
}

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];
const ua = () => UAS[Math.floor(Math.random() * UAS.length)];

// ─── ViewDNS.info HTML scrape ─────────────────────────────────────────────────
async function fromViewDNS(email: string): Promise<Result> {
  const url = `https://viewdns.info/reversewhois/?q=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": ua(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://viewdns.info/",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) throw new Error(`ViewDNS HTTP ${res.status}`);
  const html = await res.text();

  if (/captcha|cf-browser|just a moment|cloudflare/i.test(html)) {
    throw new Error("ViewDNS bot protection");
  }

  const domains: Domain[] = [];

  const rowRe = /<tr[^>]*>\s*<td[^>]*>([a-zA-Z0-9][\w.-]{1,62}\.[a-zA-Z]{2,})<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const d = m[1].trim();
    if (!domains.find(x => x.domainName === d)) {
      domains.push({ domainName: d, date: m[2].trim() || undefined });
    }
  }

  if (domains.length === 0) {
    const cellRe = /<td[^>]*>\s*([a-zA-Z0-9][\w-]{1,62}\.[a-zA-Z]{2,})\s*<\/td>/gi;
    while ((m = cellRe.exec(html)) !== null) {
      const d = m[1].trim();
      if (!domains.find(x => x.domainName === d)) domains.push({ domainName: d });
    }
  }

  if (domains.length === 0) {
    if (/no results|0 results|not found|no domains/i.test(html)) {
      return { source: "viewdns", email, count: 0, domains: [] };
    }
    throw new Error("ViewDNS: unable to parse results");
  }

  return { source: "viewdns", email, count: domains.length, domains };
}

// ─── HackerTarget reverse WHOIS ───────────────────────────────────────────────
async function fromHackerTarget(email: string): Promise<Result> {
  const url = `https://api.hackertarget.com/reversewhois/?q=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": ua(), "Accept": "text/plain" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HackerTarget HTTP ${res.status}`);
  const text = await res.text();

  if (/error|exceeded|limit|upgrade|no results/i.test(text.slice(0, 120))) {
    throw new Error(`HackerTarget: ${text.slice(0, 120).trim()}`);
  }

  const lines = text.split("\n")
    .map(l => l.trim())
    .filter(l => l && /^[a-zA-Z0-9][\w.-]{1,62}\.[a-zA-Z]{2,}$/.test(l));

  if (lines.length === 0) throw new Error("HackerTarget: no results");

  return { source: "hackertarget", email, count: lines.length, domains: lines.map(d => ({ domainName: d })) };
}

// ─── Whoxy API ────────────────────────────────────────────────────────────────
async function fromWhoxy(email: string): Promise<Result> {
  const key = Deno.env.get("WHOXY_API_KEY") || "f0634a5b032fe6276yd5c4637f3bb9150";
  const base = `https://api.whoxy.com/?key=${key}&reverse=whois&email=${encodeURIComponent(email)}&mode=micro`;

  const res = await fetch(base, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Whoxy HTTP ${res.status}`);
  const data = await res.json();
  if (data.status_code !== 1) throw new Error(data.status_reason || `Whoxy error ${data.status_code}`);

  const parse = (arr: any[]): Domain[] =>
    arr.map((r: any) => ({
      domainName: r.domain_name || "",
      date: r.create_date || r.update_date || undefined,
      registrar: r.domain_registrar?.registrar_name || undefined,
      country: r.registrant_contact?.country_name || r.registrant_contact?.country || undefined,
    })).filter((d: Domain) => d.domainName);

  const domains = parse(data.search_result || []);
  const totalPages = Math.min(data.total_pages ?? 1, 10);

  if (totalPages > 1) {
    const extra = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetch(`${base}&page=${i + 2}`, { signal: AbortSignal.timeout(20000) })
          .then(r => r.json())
          .then(d => parse(d.search_result || []))
      )
    );
    for (const r of extra) if (r.status === "fulfilled") domains.push(...r.value);
  }

  return { source: "whoxy", email, count: data.total_results ?? domains.length, domains };
}

// ─── WhoisXML preview ─────────────────────────────────────────────────────────
async function fromWhoisXML(email: string): Promise<Result> {
  const key = Deno.env.get("WHOISXML_API_KEY") || "";
  if (!key) throw new Error("No WhoisXML key");
  const res = await fetch("https://reverse-whois-api.whoisxmlapi.com/api/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: key, searchType: "current", mode: "preview", basicSearchTerms: { include: [email] } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`WhoisXML HTTP ${res.status}`);
  const data = await res.json();
  if (data.code && data.code !== 200) throw new Error(data.messages || `WhoisXML error ${data.code}`);
  return {
    source: "whoisxml",
    email,
    count: data.domainsCount ?? 0,
    domains: (data.domainsList || []).map((d: string) => ({ domainName: d })),
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: string[] = [];
    const sources: [string, () => Promise<Result>][] = [
      ["Whoxy", () => fromWhoxy(email)],
      ["ViewDNS", () => fromViewDNS(email)],
      ["HackerTarget", () => fromHackerTarget(email)],
      ["WhoisXML", () => fromWhoisXML(email)],
    ];

    for (const [name, fn] of sources) {
      try {
        const result = await fn();
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(JSON.stringify({
      source: "none", email, count: 0, domains: [],
      error: errors.join(" | "),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
      source: "none", email: "", count: 0, domains: [],
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
