import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Store, Package, Link2, LogOut, Menu, X, FileText, Wallet } from "lucide-react";
import StoreManager from "@/components/admin/StoreManager";
import ProductManager from "@/components/admin/ProductManager";
import LinkGenerator from "@/components/admin/LinkGenerator";
import OrdersReport from "@/components/admin/OrdersReport";
import BillingManager from "@/components/admin/BillingManager";
import DashboardHero from "@/components/DashboardHero";

type Tab = "stores" | "products" | "links" | "reports" | "billing";

export default function Admin() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("stores");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/manager" replace />;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "stores", label: "Lojas", icon: <Store className="h-4 w-4" /> },
    { id: "products", label: "Produtos", icon: <Package className="h-4 w-4" /> },
    { id: "links", label: "Links WhatsApp", icon: <Link2 className="h-4 w-4" /> },
    { id: "reports", label: "Relatórios", icon: <FileText className="h-4 w-4" /> },
    { id: "billing", label: "Mensalidades", icon: <Wallet className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg hidden sm:block">Painel Admin</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((t) => (
              <Button key={t.id} variant={tab === t.id ? "default" : "ghost"} size="sm" onClick={() => setTab(t.id)} className="gap-2">
                {t.icon}
                {t.label}
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user.email}
              <span className="ml-2 inline-flex items-center rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent-foreground">Admin</span>
            </span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t px-4 py-2 space-y-1">
            {tabs.map((t) => (
              <Button key={t.id} variant={tab === t.id ? "default" : "ghost"} size="sm" onClick={() => { setTab(t.id); setMobileMenuOpen(false); }} className="w-full justify-start gap-2">
                {t.icon}
                {t.label}
              </Button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl p-4 md:p-6" style={{ borderColor: "#4d79c3" }}>
        <DashboardHero role="admin" />
        {tab === "stores" && <StoreManager />}
        {tab === "products" && <ProductManager />}
        {tab === "links" && <LinkGenerator />}
        {tab === "reports" && <OrdersReport />}
        {tab === "billing" && <BillingManager />}
      </main>
    </div>
  );
}
