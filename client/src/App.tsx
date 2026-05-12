import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import History from "@/pages/history";
import ReverseWhois from "@/pages/reverse-whois";
import LockScreen from "@/components/lock-screen";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/history" component={History} />
      <Route path="/reverse" component={ReverseWhois} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <LockScreen>
          <Router />
        </LockScreen>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
