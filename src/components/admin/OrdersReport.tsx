import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, FileDown, ShoppingBag, Receipt } from "lucide-react";
import { exportOrdersPDF, exportOrdersDOCX, exportInvoicePDF, exportInvoiceDOCX, OrderRecord } from "@/lib/reportExport";
import { toast } from "@/hooks/use-toast";

export default function OrdersReport() {
  const { user, isAdmin } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const [storeId, setStoreId] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");

  // Stores visible to this user: admins see all; managers see only their managed ones
  const { data: stores = [] } = useQuery({
    queryKey: ["report-stores", user?.id, isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.from("stores").select("id, name, currency").order("name");
        if (error) throw error;
        return data;
      }
      const { data: mgr, error: e1 } = await supabase.from("store_managers").select("store_id").eq("user_id", user!.id);
      if (e1) throw e1;
      const ids = (mgr ?? []).map((m) => m.store_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("stores").select("id, name, currency").in("id", ids).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const selectedStore = useMemo(() => stores.find((s) => s.id === storeId), [stores, storeId]);

  const { data: ordersAll = [], isLoading, refetch } = useQuery({
    queryKey: ["orders-report", storeId, date],
    queryFn: async () => {
      const start = new Date(`${date}T00:00:00`).toISOString();
      const end = new Date(`${date}T23:59:59.999`).toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", storeId)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRecord[];
    },
    enabled: !!storeId && !!date,
  });

  const normalize = (s: string) => s.toLowerCase().trim();
  const digits = (s: string) => s.replace(/\D/g, "");
  const orders = useMemo(() => {
    const n = normalize(customerName);
    const p = digits(customerPhone);
    return ordersAll.filter((o) => {
      const okName = !n || normalize(o.customer_name || "").includes(n);
      const okPhone = !p || digits(o.customer_phone || "").includes(p);
      return okName && okPhone;
    });
  }, [ordersAll, customerName, customerPhone]);

  const grandTotal = orders.reduce((s, o) => s + Number(o.total), 0);

  const handleExport = (format: "pdf" | "docx") => {
    if (!selectedStore) return;
    if (orders.length === 0) {
      toast({ title: "Sem pedidos", description: "Não há pedidos para a data escolhida.", variant: "destructive" });
      return;
    }
    const meta = { storeName: selectedStore.name, dateLabel: date, currency: selectedStore.currency };
    if (format === "pdf") exportOrdersPDF(orders, meta);
    else exportOrdersDOCX(orders, meta);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Relatórios de Pedidos</h2>
        <p className="text-sm text-muted-foreground">Escolha a loja e a data para descarregar o relatório diário.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder={stores.length === 0 ? "Sem lojas atribuídas" : "Escolha a loja"} /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} />
          </div>
          <div className="space-y-2">
            <Label>Nome do cliente</Label>
            <Input placeholder="Filtrar por nome" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input placeholder="Filtrar por telefone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 lg:col-span-4">
            <Button onClick={() => handleExport("pdf")} disabled={!storeId || orders.length === 0} className="gap-2 flex-1">
              <FileDown className="h-4 w-4" /> PDF
            </Button>
            <Button onClick={() => handleExport("docx")} disabled={!storeId || orders.length === 0} variant="secondary" className="gap-2 flex-1">
              <FileText className="h-4 w-4" /> Word
            </Button>
            {(customerName || customerPhone) && (
              <Button variant="ghost" onClick={() => { setCustomerName(""); setCustomerPhone(""); }}>Limpar filtros</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {storeId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Pedidos do dia ({orders.length})</span>
              {selectedStore && <span className="text-sm font-normal text-muted-foreground">Total: <strong className="text-foreground">{grandTotal.toFixed(2)} {selectedStore.currency}</strong></span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar...</p>
            ) : orders.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Sem pedidos nesta data.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-3">Hora</th>
                      <th className="py-2 pr-3">Cliente</th>
                      <th className="py-2 pr-3">Contacto</th>
                      <th className="py-2 pr-3">Itens</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 text-right">Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{new Date(o.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-2 pr-3">{o.customer_name}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{o.customer_phone}</td>
                        <td className="py-2 pr-3">{(o.items || []).map((i) => `${i.name} x${i.qty}`).join(", ")}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap font-medium">{Number(o.total).toFixed(2)} {o.currency}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => selectedStore && exportInvoicePDF(o, { storeName: selectedStore.name, dateLabel: date, currency: selectedStore.currency })}>
                              <Receipt className="h-3 w-3" /> PDF
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => selectedStore && exportInvoiceDOCX(o, { storeName: selectedStore.name, dateLabel: date, currency: selectedStore.currency })}>
                              <Receipt className="h-3 w-3" /> Word
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
