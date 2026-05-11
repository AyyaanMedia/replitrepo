import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Download, Search, Trash2, Loader as Loader2 } from "lucide-react";
import { type WhoisResult } from "@shared/schema";

export default function Home() {
  const [domainInput, setDomainInput] = useState("");
  const [results, setResults] = useState<WhoisResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const parseDomains = (input: string): string[] => {
    return input
      .split(/[\n,]/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
      .map((d) => {
        // Remove .us if already present, we'll add it consistently
        if (d.endsWith(".us")) {
          return d.slice(0, -3);
        }
        return d;
      })
      .filter((d, index, arr) => arr.indexOf(d) === index); // Remove duplicates
  };

  const domainCount = parseDomains(domainInput).length;

  const handleSearch = useCallback(async () => {
    const domains = parseDomains(domainInput);
    if (domains.length === 0) return;

    setIsSearching(true);
    setProcessedCount(0);
    setTotalCount(domains.length);
    
    // Initialize results with pending status
    const initialResults: WhoisResult[] = domains.map((domain) => ({
      domain: `${domain}.us`,
      status: "pending",
      expiresOn: null,
      registrar: null,
      email: null,
      errorMessage: null,
    }));
    setResults(initialResults);

    // Process domains one by one for real-time updates
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      
      // Update status to checking
      setResults((prev) =>
        prev.map((r, idx) =>
          idx === i ? { ...r, status: "checking" } : r
        )
      );

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const response = await fetch(`${supabaseUrl}/functions/v1/whois-lookup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
            "Apikey": supabaseAnonKey,
          },
          body: JSON.stringify({ domain: `${domain}.us` }),
        });

        const data = await response.json();
        
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: data.status,
                  expiresOn: data.expiresOn,
                  registrar: data.registrar,
                  email: data.email,
                  errorMessage: data.errorMessage,
                }
              : r
          )
        );
      } catch (error) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error", errorMessage: "Request failed" }
              : r
          )
        );
      }

      setProcessedCount(i + 1);
    }

    setIsSearching(false);
  }, [domainInput]);

  const handleClear = () => {
    setDomainInput("");
    setResults([]);
    setProcessedCount(0);
    setTotalCount(0);
  };

  const handleClearResults = () => {
    setResults([]);
    setProcessedCount(0);
    setTotalCount(0);
  };

  const downloadCSV = () => {
    const completedResults = results.filter(
      (r) => r.status === "found" || r.status === "not_found"
    );
    
    if (completedResults.length === 0) return;

    const headers = ["Domain", "Status", "Expires On", "Registrar", "Email"];
    const rows = completedResults.map((r) => [
      r.domain,
      r.status,
      r.expiresOn || "",
      r.registrar || "",
      r.email || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `whois-results-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const getStatusBadge = (result: WhoisResult) => {
    switch (result.status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1" data-testid={`status-pending-${result.domain}`}>
            Pending
          </Badge>
        );
      case "checking":
        return (
          <Badge variant="secondary" className="gap-1 animate-pulse" data-testid={`status-checking-${result.domain}`}>
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking
          </Badge>
        );
      case "found":
        return (
          <Badge className="bg-emerald-600 dark:bg-emerald-700" data-testid={`status-found-${result.domain}`}>
            Found
          </Badge>
        );
      case "not_found":
        return (
          <Badge variant="outline" data-testid={`status-not-found-${result.domain}`}>
            Not Found
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" data-testid={`status-error-${result.domain}`}>
            Error
          </Badge>
        );
      default:
        return null;
    }
  };

  const completedCount = results.filter(
    (r) => r.status === "found" || r.status === "not_found" || r.status === "error"
  ).length;
  const foundCount = results.filter((r) => r.status === "found").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-title">
            Bulk WHOIS Lookup
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter .us domain names to look up registration details using multiple sources (RDAP, WHOIS)
          </p>
        </div>

        {/* Input Section */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Domain Names</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter domain names (one per line, without .us extension)&#10;Example:&#10;example&#10;mydomain&#10;testsite"
              className="h-40 font-mono text-sm resize-none"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              disabled={isSearching}
              data-testid="input-domains"
            />
            
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground" data-testid="text-domain-count">
                {domainCount} domain{domainCount !== 1 ? "s" : ""} ready
              </p>
              
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={handleClear}
                  disabled={isSearching || (domainInput === "" && results.length === 0)}
                  data-testid="button-clear"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || domainCount === 0}
                  data-testid="button-search"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  {isSearching ? "Searching..." : "Start Search"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {(results.length > 0 || isSearching) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-semibold">Results</CardTitle>
                  {isSearching ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-progress">
                      Searching... {processedCount} of {totalCount} domains processed
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-summary">
                      Found {foundCount} domain{foundCount !== 1 ? "s" : ""} | {completedCount} complete
                    </p>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleClearResults}
                    disabled={isSearching || results.length === 0}
                    data-testid="button-clear-results"
                  >
                    Clear Results
                  </Button>
                  <Button
                    size="sm"
                    onClick={downloadCSV}
                    disabled={foundCount === 0}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Domain</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Expires On</TableHead>
                      <TableHead className="font-semibold">Registrar</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Results will appear here as domains are processed
                        </TableCell>
                      </TableRow>
                    ) : (
                      results.map((result, index) => (
                        <TableRow
                          key={result.domain}
                          className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}
                          data-testid={`row-result-${result.domain}`}
                        >
                          <TableCell className="font-mono text-sm" data-testid={`text-domain-${result.domain}`}>
                            {result.domain}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(result)}
                          </TableCell>
                          <TableCell className="font-mono text-sm" data-testid={`text-expires-${result.domain}`}>
                            {result.expiresOn || "—"}
                          </TableCell>
                          <TableCell className="text-sm" data-testid={`text-registrar-${result.domain}`}>
                            {result.registrar || "—"}
                          </TableCell>
                          <TableCell className="text-sm" data-testid={`text-email-${result.domain}`}>
                            {result.email || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {results.length === 0 && !isSearching && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                Enter domain names above and click "Start Search" to look up WHOIS data
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
