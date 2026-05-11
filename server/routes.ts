import type { Express } from "express";
import { createServer, type Server } from "http";
import * as cheerio from "cheerio";
import whois from "whois-json";

interface RdapResult {
  found: boolean;
  expiresOn: string | null;
  registrar: string | null;
  email: string | null;
}

// Direct WHOIS lookup via port 43 (most reliable for registrant data)
async function lookupWhoisDirect(domain: string): Promise<RdapResult> {
  try {
    const result = await whois(domain, { follow: 3, timeout: 10000 });
    
    if (!result || typeof result !== 'object') {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    // Handle case where result might be an array
    const data = Array.isArray(result) ? result[0] : result;

    if (!data) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    let expiresOn: string | null = null;
    let registrar: string | null = null;
    let email: string | null = null;

    // Extract expiration date
    const expiryDate = data.registryExpiryDate || data.expirationDate || data.registrarRegistrationExpirationDate;
    if (expiryDate) {
      try {
        const date = new Date(expiryDate);
        if (!isNaN(date.getTime())) {
          expiresOn = date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } else {
          expiresOn = String(expiryDate);
        }
      } catch {
        expiresOn = String(expiryDate);
      }
    }

    // Extract registrar
    registrar = data.registrar || data.registrarName || null;

    // Extract registrant email (priority for .us domains - no privacy allowed)
    email = data.registrantEmail || 
            data.adminEmail || 
            data.techEmail || 
            data.registrarAbuseContactEmail ||
            null;

    // Check for "no match" in raw text
    const rawText = JSON.stringify(data).toLowerCase();
    if (rawText.includes("no match") || rawText.includes("not found")) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    if (expiresOn || registrar || email || data.domainName) {
      return { found: true, expiresOn, registrar, email };
    }

    return { found: false, expiresOn: null, registrar: null, email: null };
  } catch (error) {
    console.error("WHOIS direct lookup error:", error);
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

// Who-Dat API - free WHOIS lookup with no rate limits
async function lookupWhoDat(domain: string): Promise<RdapResult> {
  try {
    const url = `https://who-dat.as93.net/${encodeURIComponent(domain)}`;
    
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "WHOIS-Lookup-Tool/1.0",
      },
    });

    if (!response.ok) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    const data = await response.json();
    
    if (!data || data.error) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    let expiresOn: string | null = null;
    let registrar: string | null = null;
    let email: string | null = null;

    // Extract expiration date
    const expiryDate = data.expires || data.expiration_date || data.registry_expiry_date;
    if (expiryDate) {
      try {
        const date = new Date(expiryDate);
        if (!isNaN(date.getTime())) {
          expiresOn = date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } else {
          expiresOn = expiryDate;
        }
      } catch {
        expiresOn = expiryDate;
      }
    }

    // Extract registrar
    registrar = data.registrar?.name || data.registrar || null;

    // Extract registrant email (priority) - .us domains must show registrant info
    if (data.registrant?.email) {
      email = data.registrant.email;
    } else if (data.administrative?.email) {
      email = data.administrative.email;
    } else if (data.technical?.email) {
      email = data.technical.email;
    } else if (data.registrar?.abuse_contact?.email) {
      email = data.registrar.abuse_contact.email;
    }

    if (expiresOn || registrar || email) {
      return { found: true, expiresOn, registrar, email };
    }

    // Check if domain exists but data is limited
    if (data.domain || data.domain_name) {
      return { found: true, expiresOn, registrar, email };
    }

    return { found: false, expiresOn: null, registrar: null, email: null };
  } catch (error) {
    console.error("Who-Dat lookup error:", error);
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

// RDAP lookup for .us domains (authoritative source - Neustar)
async function lookupRdap(domain: string): Promise<RdapResult> {
  try {
    // Try multiple RDAP endpoints
    const rdapUrls = [
      `https://rdap.nic.us/domain/${encodeURIComponent(domain)}`,
      `https://rdap.verisign.com/us/v1/domain/${encodeURIComponent(domain)}`,
    ];

    for (const url of rdapUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            "Accept": "application/rdap+json, application/json",
            "User-Agent": "WHOIS-Lookup-Tool/1.0",
          },
        });

        if (response.status === 404) {
          // Domain not found in RDAP
          return { found: false, expiresOn: null, registrar: null, email: null };
        }

        if (!response.ok) {
          continue; // Try next endpoint
        }

        const data = await response.json();
        
        let expiresOn: string | null = null;
        let registrar: string | null = null;
        let email: string | null = null;

        // Extract expiration date from events
        if (data.events && Array.isArray(data.events)) {
          const expiryEvent = data.events.find(
            (e: any) => e.eventAction === "expiration"
          );
          if (expiryEvent && expiryEvent.eventDate) {
            try {
              const date = new Date(expiryEvent.eventDate);
              if (!isNaN(date.getTime())) {
                expiresOn = date.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });
              }
            } catch {
              expiresOn = expiryEvent.eventDate;
            }
          }
        }

        // Extract registrar and registrant email from entities
        if (data.entities && Array.isArray(data.entities)) {
          // Helper function to extract email from vcard
          const extractEmailFromVcard = (vcardArray: any): string | null => {
            if (!vcardArray || !Array.isArray(vcardArray) || !vcardArray[1]) return null;
            const vcard = vcardArray[1];
            const emailEntry = vcard.find((v: any) => v[0] === "email");
            return emailEntry && emailEntry[3] ? emailEntry[3] : null;
          };

          // Helper to extract name from vcard
          const extractNameFromVcard = (vcardArray: any): string | null => {
            if (!vcardArray || !Array.isArray(vcardArray) || !vcardArray[1]) return null;
            const vcard = vcardArray[1];
            const fnEntry = vcard.find((v: any) => v[0] === "fn");
            return fnEntry && fnEntry[3] ? fnEntry[3] : null;
          };

          // First pass: find registrant email (priority)
          for (const entity of data.entities) {
            if (entity.roles && entity.roles.includes("registrant")) {
              email = extractEmailFromVcard(entity.vcardArray);
              if (email) break;
              
              // Check nested entities within registrant
              if (entity.entities && Array.isArray(entity.entities)) {
                for (const subEntity of entity.entities) {
                  email = extractEmailFromVcard(subEntity.vcardArray);
                  if (email) break;
                }
              }
              if (email) break;
            }
          }

          // Second pass: if no registrant email, try admin/tech contacts
          if (!email) {
            for (const entity of data.entities) {
              if (entity.roles && (entity.roles.includes("administrative") || entity.roles.includes("technical"))) {
                email = extractEmailFromVcard(entity.vcardArray);
                if (email) break;
                
                if (entity.entities && Array.isArray(entity.entities)) {
                  for (const subEntity of entity.entities) {
                    email = extractEmailFromVcard(subEntity.vcardArray);
                    if (email) break;
                  }
                }
                if (email) break;
              }
            }
          }

          // Third pass: if still no email, get abuse contact from registrar
          if (!email) {
            for (const entity of data.entities) {
              if (entity.roles && entity.roles.includes("registrar")) {
                // Check for abuse contact in nested entities
                if (entity.entities && Array.isArray(entity.entities)) {
                  for (const subEntity of entity.entities) {
                    if (subEntity.roles && subEntity.roles.includes("abuse")) {
                      email = extractEmailFromVcard(subEntity.vcardArray);
                      if (email) break;
                    }
                  }
                }
                if (!email) {
                  email = extractEmailFromVcard(entity.vcardArray);
                }
                if (email) break;
              }
            }
          }

          // Extract registrar name
          const registrarEntity = data.entities.find(
            (e: any) => e.roles && e.roles.includes("registrar")
          );
          if (registrarEntity) {
            registrar = extractNameFromVcard(registrarEntity.vcardArray);
            if (!registrar && registrarEntity.handle) {
              registrar = registrarEntity.handle;
            }
          }
        }

        return { found: true, expiresOn, registrar, email };
      } catch {
        continue; // Try next endpoint
      }
    }

    return { found: false, expiresOn: null, registrar: null, email: null };
  } catch {
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

// Fallback: Scrape whois.com
async function lookupWhoisCom(domain: string): Promise<RdapResult> {
  try {
    const url = `https://www.whois.com/whois/${encodeURIComponent(domain)}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Get the raw WHOIS data
    const rawWhoisText = $(".df-block-raw pre").text() || $("pre.df-raw").text() || $(".df-raw").text() || "";
    
    // Check for availability indicator
    const availSection = $(".section-avail").text().toLowerCase();
    if (availSection.includes("is available")) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }
    
    // Check for "No match" messages
    if (
      rawWhoisText.toLowerCase().includes("no match") ||
      rawWhoisText.toLowerCase().includes("not found") ||
      (rawWhoisText.trim().length < 50 && !rawWhoisText.toLowerCase().includes("registry"))
    ) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    let expiresOn: string | null = null;
    let registrar: string | null = null;
    let email: string | null = null;

    const lines = rawWhoisText.split("\n");
    
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      
      if (
        (key.includes("registry expiry") || key.includes("expiration date") || key === "expiry date") &&
        !expiresOn &&
        value
      ) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            expiresOn = date.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
          } else {
            expiresOn = value;
          }
        } catch {
          expiresOn = value;
        }
      }

      if (key === "registrar" && !registrar && value) {
        registrar = value;
      }

      // Prioritize registrant email
      if (key === "registrant email" && value.includes("@")) {
        email = value;
      }
      
      // Fallback to other emails if no registrant email found
      if (
        !email &&
        (key.includes("admin email") || key.includes("tech email") || key.includes("registrar abuse contact email")) &&
        value.includes("@")
      ) {
        email = value;
      }
    }

    const hasWhoisData = $(".whois-data").length > 0 && rawWhoisText.length > 100;

    if (expiresOn || registrar || hasWhoisData) {
      return { found: true, expiresOn, registrar, email };
    }

    return { found: false, expiresOn: null, registrar: null, email: null };
  } catch {
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

// IP2WHOIS API - provides complete registrant emails (500 free queries/month)
async function lookupIP2Whois(domain: string): Promise<RdapResult> {
  const apiKey = process.env.IP2WHOIS_API_KEY;
  
  if (!apiKey) {
    return { found: false, expiresOn: null, registrar: null, email: null };
  }

  try {
    const url = `https://api.ip2whois.com/v2?key=${encodeURIComponent(apiKey)}&domain=${encodeURIComponent(domain)}`;
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    const data = await response.json();
    
    // Check for API error responses
    if (data.error || data.error_code) {
      console.error("IP2WHOIS API error:", data.error_message || data.error);
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    // Check if domain exists
    if (!data.domain || data.domain_status === "not found") {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    let expiresOn: string | null = null;
    if (data.expire_date) {
      try {
        const date = new Date(data.expire_date);
        if (!isNaN(date.getTime())) {
          expiresOn = date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } else {
          expiresOn = data.expire_date;
        }
      } catch {
        expiresOn = data.expire_date;
      }
    }

    // Extract registrant email (priority) - IP2WHOIS provides this in registrant object
    let email: string | null = null;
    if (data.registrant?.email && data.registrant.email.includes("@")) {
      email = data.registrant.email;
    } else if (data.admin?.email && data.admin.email.includes("@")) {
      email = data.admin.email;
    } else if (data.tech?.email && data.tech.email.includes("@")) {
      email = data.tech.email;
    }

    return {
      found: true,
      expiresOn,
      registrar: data.registrar?.name || null,
      email,
    };
  } catch (error) {
    console.error("IP2WHOIS lookup error:", error);
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

// Try port 43 WHOIS via public API
async function lookupWhoisApi(domain: string): Promise<RdapResult> {
  try {
    // Use a public WHOIS API as another fallback
    const url = `https://whois.freeaiapi.xyz/?name=${encodeURIComponent(domain)}`;
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    const data = await response.json();
    
    if (!data || data.error || !data.domain_name) {
      return { found: false, expiresOn: null, registrar: null, email: null };
    }

    let expiresOn: string | null = null;
    if (data.expiration_date) {
      try {
        const date = new Date(data.expiration_date);
        if (!isNaN(date.getTime())) {
          expiresOn = date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } else {
          expiresOn = data.expiration_date;
        }
      } catch {
        expiresOn = data.expiration_date;
      }
    }

    return {
      found: true,
      expiresOn,
      registrar: data.registrar || null,
      email: data.emails?.[0] || data.registrant_email || null,
    };
  } catch {
    return { found: false, expiresOn: null, registrar: null, email: null };
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // WHOIS lookup endpoint - uses multiple sources
  app.post("/api/whois", async (req, res) => {
    try {
      const { domain } = req.body;
      
      if (!domain || typeof domain !== "string") {
        return res.status(400).json({
          domain: "",
          status: "error",
          expiresOn: null,
          registrar: null,
          email: null,
          errorMessage: "Invalid domain provided",
        });
      }

      const cleanDomain = domain.trim().toLowerCase();
      
      // Helper to check if email is complete (not just @domain.com)
      const isCompleteEmail = (email: string | null): boolean => {
        if (!email) return false;
        return email.includes("@") && !email.startsWith("@");
      };

      // Try multiple sources in order of reliability for complete registrant email
      // 1. IP2WHOIS API first - provides complete registrant emails
      let result = await lookupIP2Whois(cleanDomain);
      
      // 2. If IP2WHOIS didn't work, try direct WHOIS
      if (!result.found || !isCompleteEmail(result.email)) {
        const directResult = await lookupWhoisDirect(cleanDomain);
        if (directResult.found) {
          result = {
            found: true,
            expiresOn: result.expiresOn || directResult.expiresOn,
            registrar: result.registrar || directResult.registrar,
            email: isCompleteEmail(result.email) ? result.email : (isCompleteEmail(directResult.email) ? directResult.email : result.email || directResult.email),
          };
        }
      }
      
      // 3. Try RDAP for additional data
      if (!result.found || !isCompleteEmail(result.email)) {
        const rdapResult = await lookupRdap(cleanDomain);
        if (rdapResult.found) {
          result = {
            found: true,
            expiresOn: result.expiresOn || rdapResult.expiresOn,
            registrar: result.registrar || rdapResult.registrar,
            email: isCompleteEmail(result.email) ? result.email : (isCompleteEmail(rdapResult.email) ? rdapResult.email : result.email || rdapResult.email),
          };
        }
      }
      
      // 4. Try whois.com scraping
      if (!result.found || !isCompleteEmail(result.email)) {
        const whoisResult = await lookupWhoisCom(cleanDomain);
        if (whoisResult.found) {
          result = {
            found: true,
            expiresOn: result.expiresOn || whoisResult.expiresOn,
            registrar: result.registrar || whoisResult.registrar,
            email: isCompleteEmail(result.email) ? result.email : (isCompleteEmail(whoisResult.email) ? whoisResult.email : result.email || whoisResult.email),
          };
        }
      }

      // 5. Final fallback: public WHOIS API
      if (!result.found || !isCompleteEmail(result.email)) {
        const apiResult = await lookupWhoisApi(cleanDomain);
        if (apiResult.found) {
          result = {
            found: true,
            expiresOn: result.expiresOn || apiResult.expiresOn,
            registrar: result.registrar || apiResult.registrar,
            email: isCompleteEmail(result.email) ? result.email : (isCompleteEmail(apiResult.email) ? apiResult.email : result.email || apiResult.email),
          };
        }
      }

      if (result.found) {
        return res.json({
          domain: cleanDomain,
          status: "found",
          expiresOn: result.expiresOn,
          registrar: result.registrar,
          email: result.email,
          errorMessage: null,
        });
      }

      return res.json({
        domain: cleanDomain,
        status: "not_found",
        expiresOn: null,
        registrar: null,
        email: null,
        errorMessage: null,
      });

    } catch (error) {
      console.error("WHOIS lookup error:", error);
      return res.json({
        domain: req.body?.domain || "",
        status: "error",
        expiresOn: null,
        registrar: null,
        email: null,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return httpServer;
}
