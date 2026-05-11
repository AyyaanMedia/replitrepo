import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Multiple APILayer accounts — rotates on 429 (rate limit) for effectively unlimited lookups
const APILAYER_KEYS = [
  "XnnV0ZeQgdqv0d5oyabS6YtCPcra6co6",
];

interface WhoisResult {
  found: boolean;
  expiresOn: string | null;
  registrar: string | null;
  registrantName: string | null;
  registrantOrg: string | null;
  email: string | null;
}

const EMPTY: WhoisResult = {
  found: false,
  expiresOn: null,
  registrar: null,
  registrantName: null,
  registrantOrg: null,
  email: null,
};

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
  } catch { /* ignore */ }
  return dateStr;
}

function isValidEmail(e: string | null | undefined): boolean {
  return !!e && e.includes("@") && !e.startsWith("@") && e.length > 5;
}

// ── Source 1: APILayer WHOIS — tries each key in order, skips on 429 ──────────
async function fromApiLayer(domain: string): Promise<WhoisResult> {
  for (const key of APILAYER_KEYS) {
    try {
      const res = await fetch(`https://api.apilayer.com/whois/query?domain=${encodeURIComponent(domain)}`, {
        signal: AbortSignal.timeout(10000),
        headers: { apikey: key },
      });

      // Rate limited — try next key
      if (res.status === 429) continue;

      if (!res.ok) return EMPTY;

      const json = await res.json();
      const d = json?.result;
      if (!d || !d.domain_name) return EMPTY;

      // Pick best email: registrant > admin > tech > registrar
      const email =
        isValidEmail(d.registrant_email) ? d.registrant_email :
        isValidEmail(d.admin_email) ? d.admin_email :
        isValidEmail(d.tech_email) ? d.tech_email :
        isValidEmail(d.registrar_email) ? d.registrar_email :
        null;

      return {
        found: true,
        expiresOn: formatDate(d.expiration_date),
        registrar: d.registrar || null,
        registrantName: d.registrant_name || d.registrant_organization || null,
        registrantOrg: d.registrant_organization || null,
        email,
      };
    } catch { continue; }
  }
  return EMPTY;
}

// ── Source 2: RDAP via nic.us (fallback — expiry/registrar when APILayer misses) ─
async function fromRdap(domain: string): Promise<WhoisResult> {
  const endpoints = [
    `https://rdap.nic.us/domain/${encodeURIComponent(domain)}`,
    `https://rdap.verisign.com/us/v1/domain/${encodeURIComponent(domain)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/rdap+json, application/json" },
      });
      if (res.status === 404) return EMPTY;
      if (!res.ok) continue;

      const d = await res.json();

      let expiresOn: string | null = null;
      if (Array.isArray(d.events)) {
        const ev = d.events.find((e: any) => e.eventAction === "expiration");
        if (ev?.eventDate) expiresOn = formatDate(ev.eventDate);
      }

      let registrar: string | null = null;
      let email: string | null = null;

      const getEmail = (vcard: any): string | null => {
        if (!Array.isArray(vcard?.[1])) return null;
        const e = vcard[1].find((v: any) => v[0] === "email");
        return e?.[3] || null;
      };
      const getName = (vcard: any): string | null => {
        if (!Array.isArray(vcard?.[1])) return null;
        const e = vcard[1].find((v: any) => v[0] === "fn");
        return e?.[3] || null;
      };

      if (Array.isArray(d.entities)) {
        const reg = d.entities.find((e: any) => e.roles?.includes("registrar"));
        if (reg) {
          registrar = getName(reg.vcardArray) || reg.handle || null;
          const abuseEnt = (reg.entities || []).find((s: any) => s.roles?.includes("abuse"));
          const ae = getEmail(abuseEnt?.vcardArray);
          if (isValidEmail(ae)) email = ae;
          else email = getEmail(reg.vcardArray);
        }
      }

      if (expiresOn || registrar) {
        return { found: true, expiresOn, registrar, registrantName: null, registrantOrg: null, email };
      }
    } catch { continue; }
  }
  return EMPTY;
}

// Merge: APILayer wins on email/registrant data, RDAP fills in expiry/registrar gaps
function merge(a: WhoisResult, b: WhoisResult): WhoisResult {
  if (!a.found && !b.found) return EMPTY;
  return {
    found: true,
    expiresOn: a.expiresOn || b.expiresOn,
    registrar: a.registrar || b.registrar,
    registrantName: a.registrantName || b.registrantName,
    registrantOrg: a.registrantOrg || b.registrantOrg,
    email: isValidEmail(a.email) ? a.email : isValidEmail(b.email) ? b.email : null,
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

    const { domain } = await req.json();
    if (!domain || typeof domain !== "string") {
      return new Response(
        JSON.stringify({ domain: "", status: "error", expiresOn: null, registrar: null, registrantName: null, registrantOrg: null, email: null, errorMessage: "Invalid domain" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clean = domain.trim().toLowerCase();

    const [apiLayer, rdap] = await Promise.allSettled([
      fromApiLayer(clean),
      fromRdap(clean),
    ]);

    const a = apiLayer.status === "fulfilled" ? apiLayer.value : EMPTY;
    const b = rdap.status === "fulfilled" ? rdap.value : EMPTY;
    const final = merge(a, b);

    const body = final.found
      ? {
          domain: clean,
          status: "found",
          expiresOn: final.expiresOn,
          registrar: final.registrar,
          registrantName: final.registrantName,
          registrantOrg: final.registrantOrg,
          email: final.email,
          errorMessage: null,
        }
      : {
          domain: clean,
          status: "not_found",
          expiresOn: null,
          registrar: null,
          registrantName: null,
          registrantOrg: null,
          email: null,
          errorMessage: null,
        };

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ domain: "", status: "error", expiresOn: null, registrar: null, registrantName: null, registrantOrg: null, email: null, errorMessage: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
