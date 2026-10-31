import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Store,
  Package,
  Link2,
  Menu,
  FileText,
  Wallet,
  Boxes,
  Receipt,
  Database,
  Bot,
} from "lucide-react";
import StoreManager from "@/components/admin/StoreManager";
import ProductManager from "@/components/admin/ProductManager";
import StockManager from "@/components/admin/StockManager";
import InvoicingManager from "@/components/admin/InvoicingManager";
import OrdersReport from "@/components/admin/OrdersReport";
import BillingManager from "@/components/admin/BillingManager";
import BackupManager from "@/components/admin/BackupManager";
import LinkGenerator from "@/components/admin/LinkGenerator";
import AgentDashboard from "@/components/admin/AgentDashboard";
import ActivityDashboard from "@/components/ActivityDashboard";
import DashboardHero from "@/components/DashboardHero";
import DatabaseSettings from "@/components/DatabaseSettings";
import SidebarNav, { type NavItem } from "@/components/layout/SidebarNav";

type Tab =
  | "welcome"
  | "stores"
  | "products"
  | "stock"
  | "invoices"
  | "reports"
  | "billing"
  | "backups"
  | "links"
  | "agent";

export default function Admin() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("welcome");
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

  const tabs: NavItem<Tab>[] = [
    { id: "welcome", label: "Boas-vindas", icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: "stores", label: "Lojas", icon: <Store className="h-4 w-4" /> },
    { id: "products", label: "Produtos", icon: <Package className="h-4 w-4" /> },
    { id: "stock", label: "Stock", icon: <Boxes className="h-4 w-4" /> },
    { id: "invoices", label: "Facturação", icon: <Receipt className="h-4 w-4" /> },
    { id: "reports", label: "Relatórios", icon: <FileText className="h-4 w-4" /> },
    { id: "billing", label: "Mensalidades", icon: <Wallet className="h-4 w-4" /> },
    { id: "backups", label: "Backups", icon: <Database className="h-4 w-4" /> },
    { id: "links", label: "Links WhatsApp", icon: <Link2 className="h-4 w-4" /> },
    { id: "agent", label: "Agente Bugs (AI)", icon: <Bot className="h-4 w-4 text-emerald-500" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav
        items={tabs}
        active={tab}
        onSelect={(id) => setTab(id)}
        title="Painel Admin"
        subtitle="Giltraquino Comercial"
        brandIcon={<Store className="h-5 w-5" />}
        email={user.email}
        roleBadge="Admin"
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
          <span className="truncate font-bold">Painel Admin</span>
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

      <div className="min-w-0 lg:pl-64">
        <main className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
          {tab === "welcome" && <><DashboardHero role="admin" /><ActivityDashboard role="admin" /></>}
          {tab === "stores" && <StoreManager />}
          {tab === "products" && <ProductManager />}
          {tab === "stock" && <StockManager />}
          {tab === "invoices" && <InvoicingManager />}
          {tab === "reports" && <OrdersReport />}
          {tab === "billing" && <BillingManager />}
          {tab === "backups" && <BackupManager />}
          {tab === "links" && <LinkGenerator />}
          {tab === "agent" && <AgentDashboard />}
        </main>
      </div>
      <DatabaseSettings />
    </div>
  );
}
