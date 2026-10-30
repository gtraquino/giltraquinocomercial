import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Store,
  Package,
  FileText,
  Link2,
  Phone,
  Lock,
  Receipt,
  Boxes,
  Menu,
  Database,
} from "lucide-react";
import OrdersReport from "@/components/admin/OrdersReport";
import ProductManager from "@/components/admin/ProductManager";
import ManagerContact from "@/components/admin/ManagerContact";
import ManagerLinks from "@/components/admin/ManagerLinks";
import InvoicingManager from "@/components/admin/InvoicingManager";
import StockManager from "@/components/admin/StockManager";
import BackupManager from "@/components/admin/BackupManager";
import { isStoreBlocked } from "@/lib/billing";
import DashboardHero from "@/components/DashboardHero";
import SidebarNav, { type NavItem } from "@/components/layout/SidebarNav";

import { getManagedStoreIds } from "@/lib/managerStores";

type Tab =
  | "products"
  | "stock"
  | "contact"
  | "link"
  | "reports"
  | "invoices"
  | "backups";

export default function Manager() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("products");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: myStores = [], isLoading: mgrLoading } = useQuery({
    queryKey: ["my-managed-stores-billing", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const ids = await getManagedStoreIds(user.id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from("stores")
        .select("id, name, is_blocked, paid_until, primary_color, accent_color")
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

  if (!user) return <Navigate to="/gerente-login" replace />;
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
          <Store className="h-4 w-4" /> Sair
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
          <Lock className="h-4 w-4" /> Sair
        </Button>
      </div>
    );
  }

  const tabs: NavItem<Tab>[] = [
    { id: "products", label: "Produtos", icon: <Package className="h-4 w-4" /> },
    { id: "stock", label: "Stock", icon: <Boxes className="h-4 w-4" /> },
    { id: "contact", label: "Contactos", icon: <Phone className="h-4 w-4" /> },
    { id: "link", label: "Link", icon: <Link2 className="h-4 w-4" /> },
    { id: "reports", label: "Pedidos", icon: <FileText className="h-4 w-4" /> },
    { id: "invoices", label: "Facturação", icon: <Receipt className="h-4 w-4" /> },
    { id: "backups", label: "Backups", icon: <Database className="h-4 w-4" /> },
  ];

  const activeStore = myStores[0];
  const themeStyle =
    activeStore && ((activeStore as any).primary_color || (activeStore as any).accent_color)
      ? ({
          ["--primary" as any]: (activeStore as any).primary_color || undefined,
          ["--accent" as any]:
            (activeStore as any).accent_color || (activeStore as any).primary_color || undefined,
          ["--ring" as any]: (activeStore as any).primary_color || undefined,
          backgroundColor: `hsl(${
            (activeStore as any).primary_color || (activeStore as any).accent_color
          } / 0.04)`,
        } as React.CSSProperties)
      : undefined;

  return (
    <div className="min-h-screen bg-background relative" style={themeStyle}>
      <SidebarNav
        items={tabs}
        active={tab}
        onSelect={(id) => setTab(id)}
        title="Painel do Gestor"
        subtitle={activeStore?.name ?? "As suas lojas"}
        brandIcon={<Store className="h-5 w-5" />}
        email={user.email}
        roleBadge="Gestor"
        onSignOut={signOut}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-md lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </div>
          <span className="truncate font-bold">Painel do Gestor</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      <div className="lg:pl-64">
        <main className="mx-auto max-w-7xl p-4 md:p-6" style={{ borderColor: "#4d79c3" }}>
          <DashboardHero role="manager" />
          {tab === "products" && <ProductManager />}
          {tab === "stock" && <StockManager />}
          {tab === "contact" && <ManagerContact />}
          {tab === "link" && <ManagerLinks />}
          {tab === "reports" && <OrdersReport />}
          {tab === "invoices" && <InvoicingManager />}
          {tab === "backups" && <BackupManager />}
        </main>
      </div>
    </div>
  );
}
