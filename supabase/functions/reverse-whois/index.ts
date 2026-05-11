import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// WhoisXML Reverse WHOIS API — free tier: 500 lookups/month, no credit card needed
// Key is stored as env secret WHOISXML_API_KEY
// Docs: https://reverse-whois-api.whoisxmlapi.com/api/v2
const WHOISXML_KEY = Deno.env.get("WHOISXML_API_KEY") || "";

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

async function fromWhoisXML(email: string, mode: "current" | "historic" = "current"): Promise<ReverseWhoisResult> {
  if (!WHOISXML_KEY) throw new Error("No WhoisXML API key configured");

  const body = {
    apiKey: WHOISXML_KEY,
    searchType: mode,
    mode: "purchase",
    basicSearchTerms: { include: [email] },
  };

  const res = await fetch("https://reverse-whois-api.whoisxmlapi.com/api/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhoisXML error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  // Paginated: first call returns preview; purchase mode returns all
  const domains: Domain[] = (data.domainsList || []).map((d: string | { domainName?: string; name?: string }) =>
    typeof d === "string" ? { domainName: d } : { domainName: d.domainName || d.name || String(d) }
  );

  return {
    source: "whoisxml",
    email,
    count: data.domainsCount ?? domains.length,
    domains,
  };
}

async function fromViewDNS(email: string): Promise<ReverseWhoisResult> {
  // ViewDNS.info reverse WHOIS — free, no key, returns up to 500 results
  const url = `https://viewdns.info/reversewhois/?q=${encodeURIComponent(email)}&output=json`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DomainScout/1.0)",
      "Accept": "application/json, text/html",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`ViewDNS error ${res.status}`);

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("json")) {
    const data = await res.json();
    const domains: Domain[] = (data.response?.domains || []).map((d: any) => ({
      domainName: d.name || d.domain || String(d),
      date: d.created_date || d.date || undefined,
      registrar: d.registrar || undefined,
    }));
    return {
      source: "viewdns",
      email,
      count: data.response?.count ?? domains.length,
      domains,
    };
  }

  // HTML fallback — parse table
  const html = await res.text();
  const domains: Domain[] = [];

  // Match rows in the results table
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>([a-z0-9][a-z0-9\-\.]+\.[a-z]{2,})<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const domainName = match[1].trim();
    if (domainName && domainName !== "Domain Name") {
      domains.push({
        domainName,
        date: match[2]?.trim() || undefined,
        registrar: match[3]?.trim() || undefined,
      });
    }
  }

  // Also try simpler pattern
  if (domains.length === 0) {
    const simpleRegex = /([a-z0-9][a-z0-9\-]+\.[a-z]{2,})/g;
    const tableMatch = html.match(/Results for.*?<\/table>/is);
    if (tableMatch) {
      const tableHtml = tableMatch[0];
      let m;
      const seen = new Set<string>();
      while ((m = simpleRegex.exec(tableHtml)) !== null) {
        const d = m[1];
        if (!seen.has(d) && !d.includes("viewdns") && !d.includes("cloudflare")) {
          seen.add(d);
          domains.push({ domainName: d });
        }
      }
    }
  }

  // Get count from page
  const countMatch = html.match(/(\d[\d,]+)\s+(?:domain|result)/i);
  const count = countMatch ? parseInt(countMatch[1].replace(/,/g, ""), 10) : domains.length;

  return { source: "viewdns", email, count, domains };
}

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

    const { email, mode = "current" } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean = email.trim().toLowerCase();

    // Try WhoisXML first (most accurate), fall back to ViewDNS
    let result: ReverseWhoisResult;

    if (WHOISXML_KEY) {
      try {
        result = await fromWhoisXML(clean, mode as "current" | "historic");
      } catch (err) {
        console.error("WhoisXML failed, trying ViewDNS:", err);
        try {
          result = await fromViewDNS(clean);
        } catch (err2) {
          result = { source: "none", email: clean, count: 0, domains: [], error: String(err2) };
        }
      }
    } else {
      try {
        result = await fromViewDNS(clean);
      } catch (err) {
        result = { source: "none", email: clean, count: 0, domains: [], error: String(err) };
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", source: "none", email: "", count: 0, domains: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
