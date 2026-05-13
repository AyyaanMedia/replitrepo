import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
  country: string | null;
  keyIndexUsed?: number;
}

const EMPTY: WhoisResult = {
  found: false,
  expiresOn: null,
  registrar: null,
  registrantName: null,
  registrantOrg: null,
  email: null,
  country: null,
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

// Returns RDAP endpoint URLs to try for a given domain, ordered by specificity
function rdapEndpoints(domain: string): string[] {
  const tld = domain.split(".").pop()?.toLowerCase() ?? "";
  const base: Record<string, string[]> = {
    us: [
      `https://rdap.nic.us/domain/${encodeURIComponent(domain)}`,
      `https://rdap.verisign.com/us/v1/domain/${encodeURIComponent(domain)}`,
    ],
    com: [`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(domain)}`],
    net: [`https://rdap.verisign.com/net/v1/domain/${encodeURIComponent(domain)}`],
    org: [`https://rdap.publicinterestregistry.org/rdap/domain/${encodeURIComponent(domain)}`],
    io:  [`https://rdap.iana.org/domain/${encodeURIComponent(domain)}`],
    co:  [`https://rdap.iana.org/domain/${encodeURIComponent(domain)}`],
    info:[`https://rdap.afilias.net/rdap/info/domain/${encodeURIComponent(domain)}`],
    biz: [`https://rdap.iana.org/domain/${encodeURIComponent(domain)}`],
    gov: [`https://rdap.iana.org/domain/${encodeURIComponent(domain)}`],
  };
  // Fallback: IANA bootstrap for anything else
  return base[tld] ?? [`https://rdap.iana.org/domain/${encodeURIComponent(domain)}`];
}

async function fromApiLayer(domain: string): Promise<WhoisResult> {
  for (let ki = 0; ki < APILAYER_KEYS.length; ki++) {
    const key = APILAYER_KEYS[ki];
    try {
      const res = await fetch(`https://api.apilayer.com/whois/query?domain=${encodeURIComponent(domain)}`, {
        signal: AbortSignal.timeout(10000),
        headers: { apikey: key },
      });

      if (res.status === 429) continue;
      if (!res.ok) return EMPTY;

      const json = await res.json();
      const d = json?.result;
      if (!d || !d.domain_name) return EMPTY;

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
        country: d.registrant_country || d.admin_country || null,
        keyIndexUsed: ki,
      };
    } catch { continue; }
  }
  return EMPTY;
}

async function fromRdap(domain: string): Promise<WhoisResult> {
  const endpoints = rdapEndpoints(domain);

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
      let registrantName: string | null = null;
      let registrantOrg: string | null = null;
      let email: string | null = null;
      let country: string | null = null;

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
      const getOrg = (vcard: any): string | null => {
        if (!Array.isArray(vcard?.[1])) return null;
        const e = vcard[1].find((v: any) => v[0] === "org");
        return e?.[3] || null;
      };
      const getCountry = (vcard: any): string | null => {
        if (!Array.isArray(vcard?.[1])) return null;
        const adr = vcard[1].find((v: any) => v[0] === "adr");
        // adr value array: [pobox, ext, street, city, state, postal, country]
        return adr?.[3]?.[6] || null;
      };

      if (Array.isArray(d.entities)) {
        // Registrant
        const registrant = d.entities.find((e: any) => e.roles?.includes("registrant"));
        if (registrant) {
          registrantName = getName(registrant.vcardArray);
          registrantOrg = getOrg(registrant.vcardArray);
          country = getCountry(registrant.vcardArray);
          const re = getEmail(registrant.vcardArray);
          if (isValidEmail(re)) email = re;
        }

        // Registrar
        const reg = d.entities.find((e: any) => e.roles?.includes("registrar"));
        if (reg) {
          registrar = getName(reg.vcardArray) || reg.handle || null;
          if (!isValidEmail(email)) {
            const abuseEnt = (reg.entities || []).find((s: any) => s.roles?.includes("abuse"));
            const ae = getEmail(abuseEnt?.vcardArray);
            email = isValidEmail(ae) ? ae : (getEmail(reg.vcardArray) ?? null);
          }
        }
      }

      if (expiresOn || registrar || registrantName) {
        return { found: true, expiresOn, registrar, registrantName, registrantOrg, email, country };
      }
    } catch { continue; }
  }
  return EMPTY;
}

function merge(a: WhoisResult, b: WhoisResult): WhoisResult {
  if (!a.found && !b.found) return EMPTY;
  return {
    found: true,
    expiresOn: a.expiresOn || b.expiresOn,
    registrar: a.registrar || b.registrar,
    registrantName: a.registrantName || b.registrantName,
    registrantOrg: a.registrantOrg || b.registrantOrg,
    email: isValidEmail(a.email) ? a.email : isValidEmail(b.email) ? b.email : null,
    country: a.country || b.country,
    keyIndexUsed: a.keyIndexUsed,
  };
}

async function saveHistory(
  supabase: any,
  domain: string,
  status: string,
  result: WhoisResult,
  sessionId: string,
  keyIndexUsed: number | undefined,
) {
  await supabase.from("lookup_history").insert({
    domain,
    status,
    expires_on: result.expiresOn,
    registrar: result.registrar,
    registrant_name: result.registrantName,
    registrant_org: result.registrantOrg,
    email: result.email,
    session_id: sessionId,
  });

  if (keyIndexUsed !== undefined) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("api_usage")
      .select("id, credits_used")
      .eq("used_date", today)
      .eq("key_index", keyIndexUsed)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("api_usage")
        .update({ credits_used: existing.credits_used + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("api_usage").insert({
        used_date: today,
        key_index: keyIndexUsed,
        credits_used: 1,
      });
    }
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("lookup_history").delete().lt("looked_up_at", cutoff);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { domain, sessionId = "" } = body;

    if (!domain || typeof domain !== "string") {
      return new Response(
        JSON.stringify({ domain: "", status: "error", expiresOn: null, registrar: null, registrantName: null, registrantOrg: null, email: null, country: null, errorMessage: "Invalid domain" }),
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

    const status = final.found ? "found" : "not_found";

    EdgeRuntime.waitUntil(saveHistory(supabase, clean, status, final, sessionId, final.keyIndexUsed));

    const responseBody = final.found
      ? { domain: clean, status: "found", expiresOn: final.expiresOn, registrar: final.registrar, registrantName: final.registrantName, registrantOrg: final.registrantOrg, email: final.email, country: final.country, errorMessage: null }
      : { domain: clean, status: "not_found", expiresOn: null, registrar: null, registrantName: null, registrantOrg: null, email: null, country: null, errorMessage: null };

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ domain: "", status: "error", expiresOn: null, registrar: null, registrantName: null, registrantOrg: null, email: null, country: null, errorMessage: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
