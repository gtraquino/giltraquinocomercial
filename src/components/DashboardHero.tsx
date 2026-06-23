import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "motion/react";
import { Store, Package, ShoppingBag, Clock, Calendar, Sparkles, TrendingUp, AlertCircle } from "lucide-react";

interface DashboardHeroProps {
  role: "admin" | "manager";
}

export default function DashboardHero({ role }: DashboardHeroProps) {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());

  // Clock update effect
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Format date: e.g. "Terça-feira, 23 de Junho de 2026"
  const formattedDate = time.toLocaleDateString("pt-PT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Format time: e.g. "14:39:15"
  const formattedTime = time.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Get greeting based on current local hour
  const getGreeting = () => {
    const hour = time.getHours();
    if (hour >= 5 && hour < 12) return "Bom dia";
    if (hour >= 12 && hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  // Humanize user name
  const getUserDisplayName = () => {
    if (!user?.email) return "Utilizador";
    if (user.email === "g.traquino66@gmail.com") return "Gil Traquino";
    const namePart = user.email.split("@")[0];
    return namePart
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  // Query Stats for Admin
  const { data: adminStats, isLoading: adminLoading } = useQuery({
    queryKey: ["admin-hero-stats"],
    queryFn: async () => {
      const [storesRes, productsRes, ordersRes] = await Promise.all([
        supabase.from("stores").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
      ]);

      return {
        storesCount: storesRes.count ?? 0,
        productsCount: productsRes.count ?? 0,
        ordersCount: ordersRes.count ?? 0,
      };
    },
    enabled: role === "admin" && !!user,
  });

  // Query Stats for Manager
  const { data: managerStats, isLoading: managerLoading } = useQuery({
    queryKey: ["manager-hero-stats", user?.id],
    queryFn: async () => {
      // Get manager's stores
      const { data: managedStores, error: storeErr } = await supabase
        .from("store_managers")
        .select("store_id")
        .eq("user_id", user!.id);

      if (storeErr) throw storeErr;
      const storeIds = (managedStores ?? []).map((m) => m.store_id);

      if (storeIds.length === 0) {
        return { storesCount: 0, productsCount: 0, ordersCount: 0 };
      }

      const [productsRes, ordersRes] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("store_id", storeIds),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("store_id", storeIds),
      ]);

      return {
        storesCount: storeIds.length,
        productsCount: productsRes.count ?? 0,
        ordersCount: ordersRes.count ?? 0,
      };
    },
    enabled: role === "manager" && !!user,
  });

  const stats = role === "admin" ? adminStats : managerStats;
  const isLoading = role === "admin" ? adminLoading : managerLoading;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card/90 via-card/50 to-background p-6 md:p-8 mb-8 shadow-sm"
    >
      {/* Decorative Blur Blobs */}
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row justify-between gap-6">
        {/* Left Side: Greeting, Message and Clock */}
        <div className="flex flex-col justify-between max-w-xl">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4 border border-primary/15 uppercase tracking-wider">
              <Sparkles className="h-3 w-3 animate-pulse" />
              {role === "admin" ? "Acesso Administrador" : "Área do Gestor"}
            </div>
            
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2 flex items-center gap-2">
              {getGreeting()}{" "}
              <span className="text-primary">
                {role === "admin" ? "Administrador" : "Gestor"}
              </span>
              !
            </h1>
            
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-6">
              {role === "admin"
                ? "Bem-vindo ao centro administrativo do Giltraquino Comercial. Aqui pode gerir as suas lojas, catálogos, cobranças e relatórios de encomendas de forma integrada."
                : "Bem-vindo ao seu espaço de trabalho. Gerencie o catálogo de produtos das suas lojas, atualize contactos e acompanhe os novos pedidos WhatsApp em tempo real."}
            </p>
          </div>

          {/* Clock and Calendar row */}
          <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm font-medium text-muted-foreground/80 bg-muted/40 p-3 rounded-2xl w-fit border border-muted/60">
            <div className="flex items-center gap-1.5 px-1">
              <Calendar className="h-4 w-4 text-primary/70 shrink-0" />
              <span className="capitalize">{formattedDate}</span>
            </div>
            <div className="hidden sm:block h-3 w-px bg-muted-foreground/20" />
            <div className="flex items-center gap-1.5 px-1 font-mono text-primary font-semibold">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <span>{formattedTime}</span>
            </div>
          </div>
        </div>

        {/* Right Side: Quick Stats Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:w-[500px] shrink-0">
          {/* Stat Card 1: Lojas */}
          <motion.div
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="flex flex-col justify-between rounded-2xl border border-muted/60 bg-card p-4 shadow-xs transition-all hover:shadow-md hover:border-primary/20"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lojas</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Store className="h-4.5 w-4.5" />
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-muted mb-1" />
              ) : (
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {stats?.storesCount ?? 0}
                </span>
              )}
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {role === "admin" ? "Configuradas" : "Sob gestão"}
              </p>
            </div>
          </motion.div>

          {/* Stat Card 2: Produtos */}
          <motion.div
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="flex flex-col justify-between rounded-2xl border border-muted/60 bg-card p-4 shadow-xs transition-all hover:shadow-md hover:border-primary/20"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produtos</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Package className="h-4.5 w-4.5" />
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-muted mb-1" />
              ) : (
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {stats?.productsCount ?? 0}
                </span>
              )}
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-indigo-500" />
                No catálogo
              </p>
            </div>
          </motion.div>

          {/* Stat Card 3: Pedidos */}
          <motion.div
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="flex flex-col justify-between rounded-2xl border border-muted/60 bg-card p-4 shadow-xs transition-all hover:shadow-md hover:border-primary/20"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedidos</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ShoppingBag className="h-4.5 w-4.5" />
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-muted mb-1" />
              ) : (
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {stats?.ordersCount ?? 0}
                </span>
              )}
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-500" />
                Registados
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
