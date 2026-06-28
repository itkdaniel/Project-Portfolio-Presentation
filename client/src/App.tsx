import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Booking from "@/pages/Booking";
import TestDashboard from "@/pages/TestDashboard";
import Settings from "@/pages/Settings";
import TaxAssistant from "@/pages/TaxAssistant";
import StatusPage from "@/pages/StatusPage";
import ResumePage from "@/pages/ResumePage";
import RegisterPage from "@/pages/RegisterPage";
import LoginPage from "@/pages/LoginPage";
import NotificationsPage from "@/pages/NotificationsPage";
import AdminApprovalsPage from "@/pages/AdminApprovalsPage";
import AdminScopesPage from "@/pages/AdminScopes";
import DocsPage from "@/pages/DocsPage";
import ArchitecturePage from "@/pages/ArchitecturePage";
import QuantumPage from "@/pages/QuantumPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home}/>
      <Route path="/book" component={Booking}/>
      <Route path="/tests" component={TestDashboard}/>
      <Route path="/settings" component={Settings}/>
      <Route path="/tax" component={TaxAssistant}/>
      <Route path="/status" component={StatusPage}/>
      <Route path="/resume" component={ResumePage}/>
      <Route path="/register" component={RegisterPage}/>
      <Route path="/login" component={LoginPage}/>
      <Route path="/notifications" component={NotificationsPage}/>
      <Route path="/admin/approvals" component={AdminApprovalsPage}/>
      <Route path="/admin/scopes" component={AdminScopesPage}/>
      <Route path="/docs" component={DocsPage}/>
      <Route path="/architecture" component={ArchitecturePage}/>
      <Route path="/quantum" component={QuantumPage}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
