import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Store, Package, ShoppingBag, Receipt, AlertCircle, Wallet, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getManagedStoreIds } from "@/lib/managerStores";
import { isStoreBlocked } from "@/lib/billing";
import { summarizeActivity } from "@/lib/activity";

// Fetch every page rather than silently truncating activity at the API row limit.
async function pages<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetch(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

// One failing source must not hide the rest of the dashboard.
async function safe<T>(label: string, run: () => Promise<T[]>, warnings: string[]): Promise<T[]> {
  try { return await run(); } catch (e) { warnings.push(`${label}: ${e instanceof Error ? e.message : "erro"}`); return []; }
}

const amount = (value: number, currency: string) => `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const hasOverride = () => !!localStorage.getItem("OVERRIDE_SUPABASE_URL");
const resetConnection = () => { localStorage.removeItem("OVERRIDE_SUPABASE_URL"); localStorage.removeItem("OVERRIDE_SUPABASE_PUBLISHABLE_KEY"); window.location.reload(); };

export default function ActivityDashboard({ role }: { role: "admin" | "manager" }) {
  const { user } = useAuth();
  const [period, setPeriod] = useState("30");
  const [storeId, setStoreId] = useState("all");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["welcome-activity", role, user?.id, period],
    enabled: !!user,
    retry: 1,
    refetchInterval: 60000,
    queryFn: async () => {
      if (!user) throw new Error("Sessão indisponível");
      const warnings: string[] = [];
      const ids = role === "manager" ? await getManagedStoreIds(user.id) : null;
      const stores = await pages((from, to) => {
        let query = supabase.from("stores").select("id,name,type,currency,is_blocked,paid_until").order("id");
        if (ids) query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
        return query.range(from, to);
      });
      const storeIds = stores.map(store => store.id);
      const start = new Date(Date.now() + 3600000);
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - Number(period) + 1);
      // Angola is UTC+1: midnight there is 23:00 UTC on the previous day.
      const since = new Date(start.getTime() - 3600000).toISOString();
      const day = start.toISOString().slice(0, 10);
      if (!storeIds.length) return { stores, products: [], orders: [], invoices: [], payments: [], warnings };
      const [products, orders, invoices, payments] = await Promise.all([
        safe("Produtos", () => pages((f, t) => supabase.from("products").select("id,store_id,in_stock").in("store_id", storeIds).order("id").range(f, t)), warnings),
        safe("Pedidos", () => pages((f, t) => supabase.from("orders").select("id,store_id,total,currency,created_at,customer_name").in("store_id", storeIds).gte("created_at", since).order("created_at", { ascending: false }).order("id").range(f, t)), warnings),
        safe("Facturação", () => pages((f, t) => supabase.from("invoices").select("id,store_id").in("store_id", storeIds).gte("issue_date", day).order("id").range(f, t)), warnings),
        role === "admin" ? safe("Mensalidades", () => pages((f, t) => supabase.from("store_payments").select("id,store_id,amount").in("store_id", storeIds).gte("paid_at", day).order("id").range(f, t)), warnings) : Promise.resolve([] as { id: string; store_id: string; amount: number }[]),
      ]);
      return { stores, products, orders, invoices, payments, warnings };
    },
  });
  const stores = (data?.stores ?? []).filter(store => storeId === "all" || store.id === storeId);
  const ids = stores.map(store => store.id);
  const stats = summarizeActivity(data?.orders ?? [], data?.products ?? [], ids);
  const orders = (data?.orders ?? []).filter(order => ids.includes(order.store_id));
  const blocked = stores.filter(isStoreBlocked).length;
  const invoices = (data?.invoices ?? []).filter(invoice => ids.includes(invoice.store_id)).length;
  const payments: Record<string, number> = {};
  for (const payment of data?.payments ?? []) {
    const store = stores.find(store => store.id === payment.store_id);
    if (store) payments[store.currency] = (payments[store.currency] ?? 0) + Number(payment.amount);
  }
  const periodLabel = period === "1" ? "Hoje" : `Últimos ${period} dias`;
  const tiles = [
    { label: "Lojas e restaurantes", value: stores.length, detail: `${stores.length - blocked} activos · ${blocked} bloqueados`, icon: Store },
    { label: "Produtos no catálogo", value: stats.products, detail: `${stats.unavailable} indisponíveis`, icon: Package },
    { label: "Pedidos no período", value: stats.orders, detail: periodLabel, icon: ShoppingBag },
    { label: "Documentos emitidos", value: invoices, detail: "Facturação no período", icon: Receipt },
  ];
  const errorText = error instanceof Error ? error.message : "";
  const offline = /fetch|network/i.test(errorText);

  return <section className="space-y-6" aria-label="Resumo da actividade">
    <header className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-xl font-bold">Actividade das lojas e restaurantes</h2>
        <p className="text-sm text-muted-foreground">{data ? `${periodLabel} · actualizado a cada minuto` : "Resumo de actividade"}</p>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:flex sm:items-center">
        <Select value={storeId} onValueChange={setStoreId}><SelectTrigger className="sm:w-52" aria-label="Filtrar loja"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as lojas</SelectItem>{data?.stores.map(store => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent></Select>
        <Select value={period} onValueChange={setPeriod}><SelectTrigger className="sm:w-40" aria-label="Período"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Hoje</SelectItem><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem></SelectContent></Select>
        <Button variant="outline" size="icon" aria-label="Actualizar actividade" title="Actualizar actividade" disabled={isFetching} onClick={() => refetch()}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
      </div>
    </header>

    {isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted" />)}</div>
    : isError ? <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive" role="alert">
        <p className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5" />Não foi possível carregar a actividade.</p>
        <p className="text-sm">{offline ? (hasOverride() ? "O navegador está ligado a um endereço de base de dados antigo. Reponha a ligação original." : "Sem ligação ao servidor. Verifique a internet e tente novamente.") : errorText || "Erro desconhecido."}</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>{hasOverride() && <Button onClick={resetConnection}>Repor ligação original</Button>}</div>
      </div>
    : <>
      {!!data?.warnings.length && <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm" role="status">Alguns dados não foram carregados ({data.warnings.join(" · ")}).</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles.map(tile => <article key={tile.label} className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-medium text-muted-foreground">{tile.label}</h3><span className="rounded-lg bg-primary/10 p-2"><tile.icon className="h-5 w-5 text-primary" /></span></div>
        <p className="text-3xl font-bold">{tile.value}</p><p className="mt-1 text-xs text-muted-foreground">{tile.detail}</p>
      </article>)}</div>

      <div className={`grid gap-4 ${role === "admin" ? "md:grid-cols-2" : ""}`}>
        <article className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"><ShoppingBag className="h-4 w-4" />Valor dos pedidos · {periodLabel}</h3>
          {Object.entries(stats.values).length ? Object.entries(stats.values).map(([c, v]) => <p key={c} className="text-2xl font-bold">{amount(v, c)}</p>) : <p className="text-2xl font-bold">—</p>}
          <p className="mt-1 text-xs text-muted-foreground">Pedidos registados, não pagamentos confirmados</p>
        </article>
        {role === "admin" && <article className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"><Wallet className="h-4 w-4" />Mensalidades recebidas · {periodLabel}</h3>
          {Object.entries(payments).length ? Object.entries(payments).map(([c, v]) => <p key={c} className="text-2xl font-bold">{amount(v, c)}</p>) : <p className="text-2xl font-bold">—</p>}
          <p className="mt-1 text-xs text-muted-foreground">Pagamentos registados pelo administrador</p>
        </article>}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border bg-card shadow-sm xl:col-span-2">
          <h3 className="border-b px-5 py-4 text-lg font-semibold">Actividade por estabelecimento</h3>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground"><tr>{["Estabelecimento", "Estado", "Produtos", "Pedidos", "Valor"].map(l => <th key={l} className="whitespace-nowrap px-4 py-3 font-medium">{l}</th>)}</tr></thead>
            <tbody>{stores.map(store => { const s = summarizeActivity(orders, data?.products ?? [], [store.id]); const b = isStoreBlocked(store); return <tr key={store.id} className="border-t">
              <td className="px-4 py-3 font-medium">{store.name}<span className="block text-xs font-normal capitalize text-muted-foreground">{store.type}</span></td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${b ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{b ? "Bloqueado" : "Activo"}</span></td>
              <td className="px-4 py-3">{s.products}</td><td className="px-4 py-3">{s.orders}</td>
              <td className="whitespace-nowrap px-4 py-3">{Object.entries(s.values).map(([c, v]) => <div key={c}>{amount(v, c)}</div>)}{!s.orders && "—"}</td>
            </tr>; })}</tbody>
          </table>{!stores.length && <p className="px-5 py-6 text-muted-foreground">Sem estabelecimentos disponíveis.</p>}</div>
        </article>

        <article className="rounded-xl border bg-card shadow-sm">
          <h3 className="border-b px-5 py-4 text-lg font-semibold">Pedidos mais recentes</h3>
          <div className="divide-y">{orders.slice(0, 6).map(order => <div key={order.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0"><p className="truncate font-medium">{order.customer_name}</p><p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Clock className="h-3 w-3 shrink-0" />{stores.find(s => s.id === order.store_id)?.name} · {new Date(order.created_at).toLocaleString("pt-PT", { timeZone: "Africa/Luanda", dateStyle: "short", timeStyle: "short" })}</p></div>
            <span className="shrink-0 text-sm font-semibold">{amount(Number(order.total), order.currency)}</span>
          </div>)}{!orders.length && <p className="px-5 py-6 text-muted-foreground">Sem pedidos neste período.</p>}</div>
        </article>
      </div>
    </>}
  </section>;
}
