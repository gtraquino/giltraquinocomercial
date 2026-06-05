import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Store, LogOut, Package, FileText, Link2, Phone } from "lucide-react";
import OrdersReport from "@/components/admin/OrdersReport";
import ProductManager from "@/components/admin/ProductManager";
import ManagerContact from "@/components/admin/ManagerContact";
import ManagerLinks from "@/components/admin/ManagerLinks";

type Tab = "products" | "contact" | "link" | "reports";

export default function Manager() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("products");

  const { data: managedCount = 0, isLoading: mgrLoading } = useQuery({
    queryKey: ["my-managed-stores", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("store_managers")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  if (loading || (user && mgrLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (managedCount === 0) return <Navigate to="/" replace />;

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
        {tab === "products" && <ProductManager />}
        {tab === "contact" && <ManagerContact />}
        {tab === "link" && <ManagerLinks />}
        {tab === "reports" && <OrdersReport />}
      </main>
    </div>
  );
}
