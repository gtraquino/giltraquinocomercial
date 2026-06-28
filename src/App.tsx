import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import Manager from "./pages/Manager";
import PublicStore from "./pages/PublicStore";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Tracker to redirect Supabase auth callbacks/hash tokens to /reset-password if they land elsewhere
function AuthRedirectTracker() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hash = location.hash.startsWith("#") ? location.hash.substring(1) : location.hash;
    const hashParams = new URLSearchParams(hash);

    const hasCode = searchParams.has("code") || hashParams.has("code");
    const hasRecovery = searchParams.get("type") === "recovery" || hashParams.get("type") === "recovery";
    const hasInvite = searchParams.get("type") === "invite" || hashParams.get("type") === "invite";
    const hasAccessToken = hashParams.has("access_token");
    const hasError = searchParams.has("error_description") || hashParams.has("error_description");

    if (location.pathname !== "/reset-password" && (hasCode || hasRecovery || hasInvite || hasAccessToken || hasError)) {
      console.log("Auth redirecting to /reset-password:", { hasCode, hasRecovery, hasInvite });
      navigate(`/reset-password${location.search}${location.hash}`, { replace: true });
    }
  }, [location, navigate]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuthRedirectTracker />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/manager" element={<Manager />} />
            <Route path="/gerente" element={<Manager />} />
            <Route path="/loja/:storeId" element={<PublicStore />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
