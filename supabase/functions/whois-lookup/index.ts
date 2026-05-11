import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WhoisData {
  found: boolean;
  expiresOn: string | null;
  registrar: string | null;
  email: string | null;
}

const EMPTY: WhoisData = { found: false, expiresOn: null, registrar: null, email: null };

function formatDate(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
  } catch { /* ignore */ }
  return dateStr;
}

function isValidEmail(e: string | null | undefined): boolean {
  return !!e && e.includes("@") && !e.startsWith("@") && e.length > 5;
}

// Merge two results — prefer whichever has more data
function merge(a: WhoisData, b: WhoisData): WhoisData {
  if (!a.found && !b.found) return EMPTY;
  return {
    found: true,
    expiresOn: a.expiresOn || b.expiresOn,
    registrar: a.registrar || b.registrar,
    email: isValidEmail(a.email) ? a.email : isValidEmail(b.email) ? b.email : a.email || b.email,
  };
}

// ── Source 1: RDAP (authoritative, no key required) ──────────────────────────
async function fromRdap(domain: string): Promise<WhoisData> {
  const endpoints = [
    `https://rdap.nic.us/domain/${encodeURIComponent(domain)}`,
    `https://rdap.verisign.com/us/v1/domain/${encodeURIComponent(domain)}`,
    `https://rdap.org/domain/${encodeURIComponent(domain)}`,
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
        for (const ent of d.entities) {
          if (ent.roles?.includes("registrant")) {
            const e = getEmail(ent.vcardArray);
            if (isValidEmail(e)) { email = e; break; }
            for (const sub of ent.entities || []) {
              const se = getEmail(sub.vcardArray);
              if (isValidEmail(se)) { email = se; break; }
            }
            if (email) break;
          }
        }
        if (!email) {
          for (const ent of d.entities) {
            if (ent.roles?.some((r: string) => ["administrative","technical"].includes(r))) {
              const e = getEmail(ent.vcardArray);
              if (isValidEmail(e)) { email = e; break; }
              for (const sub of ent.entities || []) {
                const se = getEmail(sub.vcardArray);
                if (isValidEmail(se)) { email = se; break; }
              }
              if (email) break;
            }
          }
        }
        const reg = d.entities.find((e: any) => e.roles?.includes("registrar"));
        if (reg) {
          registrar = getName(reg.vcardArray) || reg.handle || null;
          if (!email) {
            for (const sub of reg.entities || []) {
              if (sub.roles?.includes("abuse")) {
                const ae = getEmail(sub.vcardArray);
                if (isValidEmail(ae)) { email = ae; break; }
              }
            }
            if (!email) email = getEmail(reg.vcardArray);
          }
        }
      }

      return { found: true, expiresOn, registrar, email };
    } catch { continue; }
  }
  return EMPTY;
}

// ── Source 2: Who-Dat (free, no key) ─────────────────────────────────────────
async function fromWhoDat(domain: string): Promise<WhoisData> {
  try {
    const res = await fetch(`https://who-dat.as93.net/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json", "User-Agent": "DomainScout/1.0" },
    });
    if (!res.ok) return EMPTY;
    const d = await res.json();
    if (!d || d.error) return EMPTY;

    const expiry = d.expires || d.expiration_date || d.registry_expiry_date;
    let email: string | null = null;
    if (isValidEmail(d.registrant?.email)) email = d.registrant.email;
    else if (isValidEmail(d.administrative?.email)) email = d.administrative.email;
    else if (isValidEmail(d.technical?.email)) email = d.technical.email;
    else if (isValidEmail(d.registrar?.abuse_contact?.email)) email = d.registrar.abuse_contact.email;

    if (expiry || d.registrar?.name || d.registrar || email || d.domain || d.domain_name) {
      return {
        found: true,
        expiresOn: expiry ? formatDate(expiry) : null,
        registrar: d.registrar?.name || (typeof d.registrar === "string" ? d.registrar : null),
        email,
      };
    }
    return EMPTY;
  } catch { return EMPTY; }
}

// ── Source 3: whoisjson.com (free, no key) ────────────────────────────────────
async function fromWhoisJson(domain: string): Promise<WhoisData> {
  try {
    const res = await fetch(`https://whoisjson.com/api/v1/whois?domain=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return EMPTY;
    const d = await res.json();
    if (!d || d.error || !d.domain_name) return EMPTY;

    const expiry = d.expiration_date || d.registry_expiry_date;
    const email = isValidEmail(d.registrant_email) ? d.registrant_email
      : isValidEmail(d.emails?.[0]) ? d.emails[0] : null;

    return {
      found: true,
      expiresOn: expiry ? formatDate(expiry) : null,
      registrar: d.registrar || null,
      email,
    };
  } catch { return EMPTY; }
}

// ── Source 4: whois.freeaiapi.xyz fallback ────────────────────────────────────
async function fromFreeApi(domain: string): Promise<WhoisData> {
  try {
    const res = await fetch(`https://whois.freeaiapi.xyz/?name=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return EMPTY;
    const d = await res.json();
    if (!d || d.error || !d.domain_name) return EMPTY;

    return {
      found: true,
      expiresOn: d.expiration_date ? formatDate(d.expiration_date) : null,
      registrar: d.registrar || null,
      email: isValidEmail(d.emails?.[0]) ? d.emails[0] : isValidEmail(d.registrant_email) ? d.registrant_email : null,
    };
  } catch { return EMPTY; }
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
        JSON.stringify({ domain: "", status: "error", expiresOn: null, registrar: null, email: null, errorMessage: "Invalid domain" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clean = domain.trim().toLowerCase();

    // Run all free sources IN PARALLEL — much faster than sequential
    const [rdap, whodat, wjson, freeapi] = await Promise.allSettled([
      fromRdap(clean),
      fromWhoDat(clean),
      fromWhoisJson(clean),
      fromFreeApi(clean),
    ]);

    const results = [rdap, whodat, wjson, freeapi].map((r) =>
      r.status === "fulfilled" ? r.value : EMPTY
    );

    // Merge all results together, best data wins
    let final = results.reduce((acc, cur) => merge(acc, cur), EMPTY);

    const body = final.found
      ? { domain: clean, status: "found", expiresOn: final.expiresOn, registrar: final.registrar, email: final.email, errorMessage: null }
      : { domain: clean, status: "not_found", expiresOn: null, registrar: null, email: null, errorMessage: null };

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ domain: "", status: "error", expiresOn: null, registrar: null, email: null, errorMessage: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
