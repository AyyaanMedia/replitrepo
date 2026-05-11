# Bulk WHOIS Lookup Tool

A web application for bulk WHOIS lookups of .us domain names. Users can enter multiple domain names and get registration details including complete registrant email addresses.

## Features

- Bulk domain lookup - enter multiple domains at once (one per line)
- Real-time results - see results as each domain is processed
- Shows: Expiration Date, Registrar, and Registrant Email (complete addresses)
- CSV export - download results for further analysis
- Status indicators - pending, checking, found, not found, error
- Multi-source lookup with IP2WHOIS API integration for complete email addresses

## Technical Stack

- **Frontend**: React with TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with cheerio for HTML parsing
- **WHOIS Data Sources**: IP2WHOIS API (primary), direct WHOIS, RDAP, whois.com scraping
- **Routing**: wouter for client-side routing
- **State**: React hooks for local state management

## Environment Variables

- `IP2WHOIS_API_KEY` - Required for complete registrant email addresses (500 free queries/month from ip2location.io)
- `SESSION_SECRET` - Session encryption key

## API Endpoints

### POST /api/whois
Looks up WHOIS data for a single .us domain using multiple sources.

**Request:**
```json
{
  "domain": "example.us"
}
```

**Response:**
```json
{
  "domain": "example.us",
  "status": "found",
  "expiresOn": "Jan 1, 2025",
  "registrar": "Example Registrar",
  "email": "admin@example.com",
  "errorMessage": null
}
```

Status values: `pending`, `checking`, `found`, `not_found`, `error`

## Data Source Priority

1. **IP2WHOIS API** - Primary source, provides complete registrant emails
2. **Direct WHOIS** - Port 43 queries via whois-json package
3. **RDAP** - Authoritative registry data
4. **whois.com scraping** - Fallback HTML parsing
5. **Public WHOIS API** - Final fallback

## Important Notes

- IP2WHOIS API provides 500 free queries/month - sufficient for moderate usage
- .us domains legally cannot use privacy protection, so registrant data is typically available
- Domains are automatically appended with .us extension
- The application processes domains sequentially to avoid rate limiting

## File Structure

```
client/src/
  pages/
    home.tsx          # Main WHOIS lookup interface
  App.tsx             # App root with routing
server/
  routes.ts           # API endpoints with multi-source WHOIS lookup
  index.ts            # Express server setup
shared/
  schema.ts           # TypeScript types for WHOIS data
```
