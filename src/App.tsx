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
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

const queryClient = new QueryClient();

// Tracker to redirect Supabase auth callbacks/hash tokens to the right page
function AuthRedirectTracker() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hash = location.hash.startsWith("#") ? location.hash.substring(1) : location.hash;
    const hashParams = new URLSearchParams(hash);

    const type = searchParams.get("type") || hashParams.get("type");
    const hasCode = searchParams.has("code") || hashParams.has("code");
    const hasTokenHash = searchParams.has("token_hash") || hashParams.has("token_hash");
    const hasRecovery = type === "recovery";
    const hasInvite = type === "invite";
    const hasSignup = type === "signup" || type === "email_change";
    const hasAccessToken = hashParams.has("access_token");
    const hasError = searchParams.has("error_description") || hashParams.has("error_description");

    // Se for confirmação de registo ou alteração de email com sucesso, redirecionar para o painel
    if (hasSignup && hasAccessToken) {
      navigate("/manager", { replace: true });
      return;
    }

    // Se for recuperação de senha ou convite, redirecionar para /reset-password
    if (location.pathname !== "/reset-password" && (hasRecovery || hasInvite || (hasTokenHash && type === "recovery") || (hasCode && type === "recovery") || hasError)) {
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
            <Route path="/privacidade" element={<PrivacyPolicy />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/termos" element={<TermsOfService />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
