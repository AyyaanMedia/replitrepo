import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RdapResult {
  found: boolean;
  expiresOn: string | null;
  registrar: string | null;
  email: string | null;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  } catch {
    // fall through
  }
  return dateStr;
}

async function lookupIP2Whois(domain: string): Promise<RdapResult> {
  const apiKey = Deno.env.get("IP2WHOIS_API_KEY");
  if (!apiKey) return { found: false, expiresOn: null, registrar: null, email: null };

  try {
    const url = `https://api.ip2whois.com/v2?key=${encodeURIComponent(apiKey)}&domain=${encodeURIComponent(domain)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return { found: false, expiresOn: null, registrar: null, email: null };

    const data = await response.json();
    if (data.error || data.error_code || !data.domain || data.domain_status === "not found") {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    let email: string | null = null;
    if (data.registrant?.email?.includes("@")) email = data.registrant.email;
    else if (data.admin?.email?.includes("@")) email = data.admin.email;
    else if (data.tech?.email?.includes("@")) email = data.tech.email;

    return {
      found: true,
      expiresOn: data.expire_date ? formatDate(data.expire_date) : null,
      registrar: data.registrar?.name || null,
      email,
    };
  } catch {
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

async function lookupWhoDat(domain: string): Promise<RdapResult> {
  try {
    const url = `https://who-dat.as93.net/${encodeURIComponent(domain)}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "WHOIS-Lookup-Tool/1.0" },
    });
    if (!response.ok) return { found: false, expiresOn: null, registrar: null, email: null };

    const data = await response.json();
    if (!data || data.error) return { found: false, expiresOn: null, registrar: null, email: null };

    const expiryDate = data.expires || data.expiration_date || data.registry_expiry_date;
    let email: string | null = null;
    if (data.registrant?.email) email = data.registrant.email;
    else if (data.administrative?.email) email = data.administrative.email;
    else if (data.technical?.email) email = data.technical.email;
    else if (data.registrar?.abuse_contact?.email) email = data.registrar.abuse_contact.email;

    if (expiryDate || data.registrar?.name || email || data.domain || data.domain_name) {
      return {
        found: true,
        expiresOn: expiryDate ? formatDate(expiryDate) : null,
        registrar: data.registrar?.name || data.registrar || null,
        email,
      };
    }
    return { found: false, expiresOn: null, registrar: null, email: null };
  } catch {
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

async function lookupRdap(domain: string): Promise<RdapResult> {
  const rdapUrls = [
    `https://rdap.nic.us/domain/${encodeURIComponent(domain)}`,
    `https://rdap.verisign.com/us/v1/domain/${encodeURIComponent(domain)}`,
  ];

  for (const url of rdapUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/rdap+json, application/json",
          "User-Agent": "WHOIS-Lookup-Tool/1.0",
        },
      });

      if (response.status === 404) return { found: false, expiresOn: null, registrar: null, email: null };
      if (!response.ok) continue;

      const data = await response.json();

      let expiresOn: string | null = null;
      if (data.events && Array.isArray(data.events)) {
        const expiryEvent = data.events.find((e: any) => e.eventAction === "expiration");
        if (expiryEvent?.eventDate) expiresOn = formatDate(expiryEvent.eventDate);
      }

      let registrar: string | null = null;
      let email: string | null = null;

      if (data.entities && Array.isArray(data.entities)) {
        const extractEmail = (vcardArray: any): string | null => {
          if (!vcardArray || !Array.isArray(vcardArray) || !vcardArray[1]) return null;
          const entry = vcardArray[1].find((v: any) => v[0] === "email");
          return entry?.[3] || null;
        };
        const extractName = (vcardArray: any): string | null => {
          if (!vcardArray || !Array.isArray(vcardArray) || !vcardArray[1]) return null;
          const entry = vcardArray[1].find((v: any) => v[0] === "fn");
          return entry?.[3] || null;
        };

        for (const entity of data.entities) {
          if (entity.roles?.includes("registrant")) {
            email = extractEmail(entity.vcardArray);
            if (!email && entity.entities) {
              for (const sub of entity.entities) {
                email = extractEmail(sub.vcardArray);
                if (email) break;
              }
            }
            if (email) break;
          }
        }

        if (!email) {
          for (const entity of data.entities) {
            if (entity.roles?.includes("administrative") || entity.roles?.includes("technical")) {
              email = extractEmail(entity.vcardArray);
              if (!email && entity.entities) {
                for (const sub of entity.entities) {
                  email = extractEmail(sub.vcardArray);
                  if (email) break;
                }
              }
              if (email) break;
            }
          }
        }

        const registrarEntity = data.entities.find((e: any) => e.roles?.includes("registrar"));
        if (registrarEntity) {
          registrar = extractName(registrarEntity.vcardArray) || registrarEntity.handle || null;
          if (!email && registrarEntity.entities) {
            for (const sub of registrarEntity.entities) {
              if (sub.roles?.includes("abuse")) {
                email = extractEmail(sub.vcardArray);
                if (email) break;
              }
            }
          }
          if (!email) email = extractEmail(registrarEntity.vcardArray);
        }
      }

      return { found: true, expiresOn, registrar, email };
    } catch {
      continue;
    }
  }
  return { found: false, expiresOn: null, registrar: null, email: null };
}

async function lookupWhoisApi(domain: string): Promise<RdapResult> {
  try {
    const url = `https://whois.freeaiapi.xyz/?name=${encodeURIComponent(domain)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return { found: false, expiresOn: null, registrar: null, email: null };

    const data = await response.json();
    if (!data || data.error || !data.domain_name) return { found: false, expiresOn: null, registrar: null, email: null };

    return {
      found: true,
      expiresOn: data.expiration_date ? formatDate(data.expiration_date) : null,
      registrar: data.registrar || null,
      email: data.emails?.[0] || data.registrant_email || null,
    };
  } catch {
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

function isCompleteEmail(email: string | null): boolean {
  return !!email && email.includes("@") && !email.startsWith("@");
}

function mergeResults(current: RdapResult, next: RdapResult): RdapResult {
  if (!next.found) return current;
  return {
    found: true,
    expiresOn: current.expiresOn || next.expiresOn,
    registrar: current.registrar || next.registrar,
    email: isCompleteEmail(current.email) ? current.email : (isCompleteEmail(next.email) ? next.email : current.email || next.email),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { domain } = body;

    if (!domain || typeof domain !== "string") {
      return new Response(
        JSON.stringify({
          domain: "",
          status: "error",
          expiresOn: null,
          registrar: null,
          email: null,
          errorMessage: "Invalid domain provided",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanDomain = domain.trim().toLowerCase();

    let result: RdapResult = { found: false, expiresOn: null, registrar: null, email: null };

    result = mergeResults(result, await lookupIP2Whois(cleanDomain));

    if (!result.found || !isCompleteEmail(result.email)) {
      result = mergeResults(result, await lookupWhoDat(cleanDomain));
    }

    if (!result.found || !isCompleteEmail(result.email)) {
      result = mergeResults(result, await lookupRdap(cleanDomain));
    }

    if (!result.found || !isCompleteEmail(result.email)) {
      result = mergeResults(result, await lookupWhoisApi(cleanDomain));
    }

    const responseData = result.found
      ? { domain: cleanDomain, status: "found", expiresOn: result.expiresOn, registrar: result.registrar, email: result.email, errorMessage: null }
      : { domain: cleanDomain, status: "not_found", expiresOn: null, registrar: null, email: null, errorMessage: null };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        domain: "",
        status: "error",
        expiresOn: null,
        registrar: null,
        email: null,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
