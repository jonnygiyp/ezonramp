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
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Diagnostics from "./pages/Diagnostics";
import StripeOnrampPage from "./pages/StripeOnrampPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
          <Route path="/stripe-onramp" element={<StripeOnrampPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
};

const App = () => (
  <ErrorBoundary>
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
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
