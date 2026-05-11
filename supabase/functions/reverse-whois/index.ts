import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Whoxy reverse WHOIS API — free, no credit card needed
// Key stored as env secret WHOXY_API_KEY
// Docs: https://www.whoxy.com/reverse-whois/
const WHOXY_KEY = Deno.env.get("WHOXY_API_KEY") || "dab4acf08fce422hhqce0041174165766";

// WhoisXML reverse WHOIS — paid but has free preview (10 results preview mode)
const WHOISXML_KEY = Deno.env.get("WHOISXML_API_KEY") || "";

interface Domain {
  domainName: string;
  date?: string;
  registrar?: string;
}

interface ReverseWhoisResult {
  source: "whoxy" | "whoisxml" | "none";
  email: string;
  count: number;
  domains: Domain[];
  error?: string;
}

async function fromWhoxy(email: string, page = 1): Promise<ReverseWhoisResult> {
  if (!WHOXY_KEY) throw new Error("WHOXY_API_KEY not configured");

  // "micro" mode returns up to 2500 results per page
  const url = `https://api.whoxy.com/?key=${WHOXY_KEY}&reverse=whois&email=${encodeURIComponent(email)}&mode=micro&page=${page}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Whoxy HTTP ${res.status}`);

  const data = await res.json();

  if (data.status_code !== 1) {
    throw new Error(data.status_reason || `Whoxy error code ${data.status_code}`);
  }

  const totalPages: number = data.total_pages ?? 1;
  const totalResults: number = data.total_results ?? 0;

  const domains: Domain[] = (data.search_result || []).map((r: any) => ({
    domainName: r.domain_name || "",
    date: r.create_date || r.update_date || undefined,
    registrar: r.domain_registrar?.registrar_name || undefined,
  })).filter((d: Domain) => d.domainName);

  // If there are more pages, fetch them all (up to page 10 = 25,000 results max)
  const allDomains = [...domains];
  const maxPages = Math.min(totalPages, 10);

  if (page === 1 && totalPages > 1) {
    const pagePromises: Promise<void>[] = [];
    for (let p = 2; p <= maxPages; p++) {
      const pg = p;
      pagePromises.push(
        (async () => {
          try {
            const pUrl = `https://api.whoxy.com/?key=${WHOXY_KEY}&reverse=whois&email=${encodeURIComponent(email)}&mode=micro&page=${pg}`;
            const pRes = await fetch(pUrl, { signal: AbortSignal.timeout(20000) });
            if (!pRes.ok) return;
            const pData = await pRes.json();
            if (pData.status_code === 1) {
              const pDomains: Domain[] = (pData.search_result || []).map((r: any) => ({
                domainName: r.domain_name || "",
                date: r.create_date || r.update_date || undefined,
                registrar: r.domain_registrar?.registrar_name || undefined,
              })).filter((d: Domain) => d.domainName);
              allDomains.push(...pDomains);
            }
          } catch { /* skip failed page */ }
        })()
      );
    }
    await Promise.all(pagePromises);
  }

  return {
    source: "whoxy",
    email,
    count: totalResults,
    domains: allDomains,
  };
}

async function fromWhoisXML(email: string): Promise<ReverseWhoisResult> {
  if (!WHOISXML_KEY) throw new Error("WHOISXML_API_KEY not configured");

  // preview mode — free, shows up to 10 results but gives accurate count
  const body = {
    apiKey: WHOISXML_KEY,
    searchType: "current",
    mode: "preview",
    basicSearchTerms: { include: [email] },
  };

  const res = await fetch("https://reverse-whois-api.whoisxmlapi.com/api/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`WhoisXML HTTP ${res.status}`);
  const data = await res.json();

  const domains: Domain[] = (data.domainsList || []).map((d: string) => ({ domainName: d }));

  return {
    source: "whoisxml",
    email,
    count: data.domainsCount ?? domains.length,
    domains,
  };
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

    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean = email.trim().toLowerCase();
    let result: ReverseWhoisResult;

    if (WHOXY_KEY) {
      try {
        result = await fromWhoxy(clean);
      } catch (err) {
        // fall back to WhoisXML preview if available
        if (WHOISXML_KEY) {
          try {
            result = await fromWhoisXML(clean);
          } catch (err2) {
            result = { source: "none", email: clean, count: 0, domains: [], error: String(err2) };
          }
        } else {
          result = { source: "none", email: clean, count: 0, domains: [], error: String(err) };
        }
      }
    } else if (WHOISXML_KEY) {
      try {
        result = await fromWhoisXML(clean);
      } catch (err) {
        result = { source: "none", email: clean, count: 0, domains: [], error: String(err) };
      }
    } else {
      result = {
        source: "none",
        email: clean,
        count: 0,
        domains: [],
        error: "No API key configured. Add WHOXY_API_KEY (free at whoxy.com) to enable reverse WHOIS lookups.",
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
        source: "none", email: "", count: 0, domains: [],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
