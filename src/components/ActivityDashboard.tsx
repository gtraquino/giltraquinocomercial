import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Store, Package, ShoppingBag, Receipt, AlertCircle } from "lucide-react";
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

const amount = (value: number, currency: string) => `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function ActivityDashboard({ role }: { role: "admin" | "manager" }) {
  const { user } = useAuth();
  const [period, setPeriod] = useState("30");
  const [storeId, setStoreId] = useState("all");
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["welcome-activity", role, user?.id, period],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      if (!user) throw new Error("Sessão indisponível");
      const ids = role === "manager" ? await getManagedStoreIds(user.id) : null;
      const stores = await pages((from, to) => {
        let query = supabase.from("stores").select("id,name,type,currency,is_blocked,paid_until").order("id");
        if (ids) query = query.in("id", ids);
        return query.range(from, to);
      });
      const storeIds = stores.map(store => store.id);
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - Number(period) + 1);
      // Angola is UTC+1: midnight there is 23:00 UTC on the previous day.
      const since = new Date(start.getTime() - 3600000).toISOString();
      if (!storeIds.length) return { stores, products: [], orders: [], invoices: [], payments: [] };
      const [products, orders, invoices, payments] = await Promise.all([
        pages((from, to) => supabase.from("products").select("id,store_id,in_stock").in("store_id", storeIds).order("id").range(from, to)),
        pages((from, to) => supabase.from("orders").select("id,store_id,total,currency,created_at,customer_name").in("store_id", storeIds).gte("created_at", since).order("created_at", { ascending: false }).order("id").range(from, to)),
        pages((from, to) => supabase.from("invoices").select("id,store_id").in("store_id", storeIds).gte("issue_date", start.toISOString().slice(0, 10)).order("id").range(from, to)),
        role === "admin" ? pages((from, to) => supabase.from("store_payments").select("id,store_id,amount").in("store_id", storeIds).gte("paid_at", start.toISOString().slice(0, 10)).order("id").range(from, to)) : Promise.resolve([]),
      ]);
      return { stores, products, orders, invoices, payments };
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
  const tiles = [
    { label: "Lojas e restaurantes", value: stores.length, detail: `${stores.length - blocked} activos · ${blocked} bloqueados`, icon: Store },
    { label: "Produtos no catálogo", value: stats.products, detail: `${stats.unavailable} indisponíveis`, icon: Package },
    { label: "Pedidos no período", value: stats.orders, detail: period === "1" ? "Hoje" : `Últimos ${period} dias`, icon: ShoppingBag },
    { label: "Documentos emitidos", value: invoices, detail: "Facturação no período", icon: Receipt },
  ];
  return <section className="space-y-6" aria-label="Resumo da actividade">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">Actividade das lojas e restaurantes</h2><p className="text-sm text-muted-foreground">{data ? "Dados actualizados a cada minuto" : "Resumo de actividade"}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={storeId} onValueChange={setStoreId}><SelectTrigger className="w-52" aria-label="Filtrar loja"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as minhas lojas</SelectItem>{data?.stores.map(store => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent></Select>
        <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-40" aria-label="Período"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Hoje</SelectItem><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem></SelectContent></Select>
        <Button variant="outline" size="icon" aria-label="Actualizar actividade" title="Actualizar actividade" disabled={isFetching} onClick={() => refetch()}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
      </div>
    </div>
    {isLoading ? <p className="py-12 text-center text-muted-foreground" role="status">A carregar actividade…</p> : isError ? <div className="flex flex-wrap items-center gap-3 border border-destructive/30 p-4 text-destructive" role="alert"><AlertCircle className="h-5 w-5" />Não foi possível carregar a actividade.<Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles.map(tile => <article key={tile.label} className="rounded-lg border bg-card p-5"><div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm text-muted-foreground">{tile.label}</h3><tile.icon className="h-5 w-5 shrink-0 text-primary" /></div><p className="text-3xl font-bold">{tile.value}</p><p className="mt-2 text-xs text-muted-foreground">{tile.detail}</p></article>)}</div>
      <div className="flex flex-wrap gap-x-12 gap-y-4 border-y py-5"><div><h3 className="text-sm text-muted-foreground">Valor dos pedidos · {period === "1" ? "Hoje" : `${period} dias`}</h3>{Object.entries(stats.values).length ? Object.entries(stats.values).map(([currency, value]) => <p key={currency} className="text-xl font-semibold">{amount(value, currency)}</p>) : <p className="text-xl font-semibold">—</p>}<p className="mt-1 text-xs text-muted-foreground">Pedidos registados, não pagamentos confirmados</p></div>{role === "admin" && <div><h3 className="text-sm text-muted-foreground">Mensalidades recebidas no período</h3>{Object.entries(payments).length ? Object.entries(payments).map(([currency, value]) => <p key={currency} className="text-xl font-semibold">{amount(value, currency)}</p>) : <p className="text-xl font-semibold">Sem pagamentos registados</p>}</div>}</div>
      <div><h3 className="mb-3 text-lg font-semibold">Actividade por estabelecimento</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr>{["Estabelecimento", "Estado", "Produtos", "Pedidos", "Valor dos pedidos"].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{stores.map(store => { const summary = summarizeActivity(orders, data?.products ?? [], [store.id]); return <tr key={store.id} className="border-b"><td className="px-3 py-4 font-medium">{store.name}<span className="block text-xs font-normal text-muted-foreground">{store.type}</span></td><td className={`px-3 py-4 ${isStoreBlocked(store) ? "text-destructive" : "text-primary"}`}>{isStoreBlocked(store) ? "Bloqueado" : "Activo"}</td><td className="px-3 py-4">{summary.products}</td><td className="px-3 py-4">{summary.orders}</td><td className="whitespace-nowrap px-3 py-4">{Object.entries(summary.values).map(([currency, value]) => <div key={currency}>{amount(value, currency)}</div>)}{!summary.orders && "—"}</td></tr>; })}</tbody></table>{!stores.length && <p className="py-6 text-muted-foreground">Sem estabelecimentos disponíveis.</p>}</div></div>
      <div><h3 className="mb-3 text-lg font-semibold">Pedidos mais recentes</h3>{orders.slice(0, 5).map(order => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3"><div><p className="font-medium">{order.customer_name}</p><p className="text-xs text-muted-foreground">{stores.find(store => store.id === order.store_id)?.name} · {new Date(order.created_at).toLocaleString("pt-PT", { timeZone: "Africa/Luanda" })}</p></div><span className="text-sm font-semibold">{amount(Number(order.total), order.currency)}</span></div>)}{!orders.length && <p className="py-4 text-muted-foreground">Sem pedidos neste período.</p>}</div>
    </>}
  </section>;
}