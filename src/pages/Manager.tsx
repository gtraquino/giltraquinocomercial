import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Store, LogOut, Package, FileText, Link2, Phone, Lock } from "lucide-react";
import OrdersReport from "@/components/admin/OrdersReport";
import ProductManager from "@/components/admin/ProductManager";
import ManagerContact from "@/components/admin/ManagerContact";
import ManagerLinks from "@/components/admin/ManagerLinks";
import { isStoreBlocked } from "@/lib/billing";
import DashboardHero from "@/components/DashboardHero";

type Tab = "products" | "contact" | "link" | "reports";

export default function Manager() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("products");

  const { data: myStores = [], isLoading: mgrLoading } = useQuery({
    queryKey: ["my-managed-stores-billing", user?.id],
    queryFn: async () => {
      // Step 1: Get store ids from store_managers
      const { data: mgrRows, error: mgrErr } = await supabase
        .from("store_managers")
        .select("store_id")
        .eq("user_id", user!.id);
      if (mgrErr) throw mgrErr;
      
      const ids = (mgrRows ?? []).map((r: any) => r.store_id);
      if (ids.length === 0) return [];
      
      // Step 2: Fetch stores details for those ids
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, is_blocked, paid_until")
        .in("id", ids)
        .order("name");
      if (error) throw error;
      
      return data ?? [];
    },
    enabled: !!user,
  });
  const managedCount = myStores.length;
  const allBlocked = managedCount > 0 && myStores.every((s) => isStoreBlocked(s));

  if (loading || (user && mgrLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  
  if (managedCount === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Store className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Sem lojas associadas</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          A sua conta de gestor ainda não tem nenhuma loja associada. 
          Por favor, contacte o administrador para lhe atribuir uma loja no painel principal.
        </p>
        <Button variant="outline" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    );
  }

  if (allBlocked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Acesso bloqueado</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          A(s) sua(s) loja(s) está(ão) com a mensalidade em atraso ou foi(ram) bloqueada(s).
          Contacte o administrador para regularizar a situação.
        </p>
        <Button variant="outline" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "products", label: "Produtos", icon: <Package className="h-4 w-4" /> },
    { id: "contact", label: "Contactos", icon: <Phone className="h-4 w-4" /> },
    { id: "link", label: "Link", icon: <Link2 className="h-4 w-4" /> },
    { id: "reports", label: "Pedidos", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
              <Store className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg hidden sm:block">Painel do Gestor</span>
          </div>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => (
              <Button key={t.id} variant={tab === t.id ? "default" : "ghost"} size="sm" onClick={() => setTab(t.id)} className="gap-2">
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden md:block truncate max-w-[160px]">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <DashboardHero role="manager" />
        {tab === "products" && <ProductManager />}
        {tab === "contact" && <ManagerContact />}
        {tab === "link" && <ManagerLinks />}
        {tab === "reports" && <OrdersReport />}
      </main>
    </div>
  );
}
