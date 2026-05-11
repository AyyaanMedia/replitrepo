declare module 'whois-json' {
  interface WhoisOptions {
    follow?: number;
    timeout?: number;
  }
  
  interface WhoisResult {
    domainName?: string;
    registrar?: string;
    registrarName?: string;
    registryExpiryDate?: string;
    expirationDate?: string;
    registrarRegistrationExpirationDate?: string;
    registrantEmail?: string;
    adminEmail?: string;
    techEmail?: string;
    registrarAbuseContactEmail?: string;
    [key: string]: any;
  }
  
  function whois(domain: string, options?: WhoisOptions): Promise<WhoisResult | WhoisResult[]>;
  export default whois;
}
