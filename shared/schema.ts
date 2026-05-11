import { z } from "zod";

// WHOIS lookup result schema
export const whoisResultSchema = z.object({
  domain: z.string(),
  status: z.enum(["pending", "checking", "found", "not_found", "error"]),
  expiresOn: z.string().nullable(),
  registrar: z.string().nullable(),
  email: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export type WhoisResult = z.infer<typeof whoisResultSchema>;

// Bulk lookup request
export const bulkLookupRequestSchema = z.object({
  domains: z.array(z.string().min(1)),
});

export type BulkLookupRequest = z.infer<typeof bulkLookupRequestSchema>;

// Bulk lookup response
export const bulkLookupResponseSchema = z.object({
  results: z.array(whoisResultSchema),
});

export type BulkLookupResponse = z.infer<typeof bulkLookupResponseSchema>;
