import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ParticleConnectkit } from "./connectkit";
import { AuthProvider } from "./hooks/useAuth";
import { useGlobalErrorLogger } from "./hooks/useGlobalErrorLogger";
import ErrorBoundary from "./components/ErrorBoundary";
import { isCurrentDarkPortalRoute } from "./lib/portalRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Diagnostics from "./pages/Diagnostics";
import NotFound from "./pages/NotFound";
import PartnerPortal from "./pages/PartnerPortal";
import DarkPortal from "./pages/DarkPortal";

const queryClient = new QueryClient();
const isDarkPortalRoute = isCurrentDarkPortalRoute();

const suspenseFallback = isDarkPortalRoute ? (
  <div className="pp-route-boot" data-route-theme="dark-portal">
    <div className="pp-route-spinner" aria-label="Loading" />
  </div>
) : (
  <div className="flex items-center justify-center min-h-screen">Loading...</div>
);

// Inner component that can use hooks
const AppContent = () => {
  useGlobalErrorLogger();
  
  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/express" element={<PartnerPortal />} />
          <Route path="/dark" element={<DarkPortal />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
};

const App = () => (
  <ErrorBoundary>
    <Suspense fallback={suspenseFallback}>
      <ParticleConnectkit>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </QueryClientProvider>
      </ParticleConnectkit>
    </Suspense>
  </ErrorBoundary>
);

export default App;
