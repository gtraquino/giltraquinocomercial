import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  FileText, 
  FileDown, 
  ShoppingBag, 
  Receipt, 
  Calendar, 
  Package, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Calculator,
  Search,
  ArrowUpDown,
  Download
} from "lucide-react";
import { exportOrdersPDF, exportOrdersDOCX, exportInvoicePDF, exportInvoiceDOCX, exportInvoiceTicketPDF, OrderRecord } from "@/lib/reportExport";
import { toast } from "@/hooks/use-toast";

type SubTab = "date" | "product" | "customer";

export default function OrdersReport() {
  const { user, isAdmin } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  
  // Default to first day of the current month for a cleaner starting date range
  const defaultStartDate = () => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  };

  const [startDate, setStartDate] = useState<string>(defaultStartDate());
  const [endDate, setEndDate] = useState<string>(today);
  const [storeId, setStoreId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<SubTab>("date");

  // Search filter states
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [customerReportSearch, setCustomerReportSearch] = useState("");

  // Sort states
  const [productSortField, setProductSortField] = useState<"qty" | "total">("total");
  const [customerSortField, setCustomerSortField] = useState<"count" | "total">("total");

  // Stores visible to this user: admins see all; managers see only their managed ones
  const { data: stores = [] } = useQuery({
    queryKey: ["report-stores", user?.id, isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.from("stores").select("*").order("name");
        if (error) throw error;
        return data;
      }
      const { data: mgr, error: e1 } = await supabase.from("store_managers").select("store_id").eq("user_id", user!.id);
      if (e1) throw e1;
      const ids = (mgr ?? []).map((m) => m.store_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("stores").select("*").in("id", ids).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Auto-select first store if none selected
  useEffect(() => {
    if (stores && stores.length > 0 && !storeId) {
      setStoreId(stores[0].id);
    }
  }, [stores, storeId]);

  const selectedStore = useMemo(() => stores.find((s) => s.id === storeId), [stores, storeId]);

  // Query all orders in date range
  const { data: ordersAll = [], isLoading } = useQuery({
    queryKey: ["orders-report-range", storeId, startDate, endDate],
    queryFn: async () => {
      const start = new Date(`${startDate}T00:00:00`).toISOString();
      const end = new Date(`${endDate}T23:59:59.999`).toISOString();
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
    enabled: !!storeId && !!startDate && !!endDate,
  });

  // Filters for orders list (Date Tab)
  const ordersFiltered = useMemo(() => {
    const search = customerSearch.toLowerCase().trim();
    if (!search) return ordersAll;
    return ordersAll.filter(
      (o) =>
        (o.customer_name || "").toLowerCase().includes(search) ||
        (o.customer_phone || "").toLowerCase().includes(search)
    );
  }, [ordersAll, customerSearch]);

  // Aggregated Sales by Product
  const productSales = useMemo(() => {
    const map = new Map<string, { id: string; name: string; qty: number; total: number; storeCurrency: string }>();
    ordersAll.forEach((o) => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          const id = item.id || item.name;
          const qty = Number(item.qty) || 1;
          const price = Number(item.price) || 0;
          const current = map.get(id) || { id, name: item.name, qty: 0, total: 0, storeCurrency: o.currency || "AOA" };
          current.qty += qty;
          current.total += price * qty;
          map.set(id, current);
        });
      }
    });

    const list = Array.from(map.values());

    // Filter by product search
    const filtered = list.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase().trim()));

    // Sort
    return filtered.sort((a, b) => {
      if (productSortField === "qty") return b.qty - a.qty;
      return b.total - a.total;
    });
  }, [ordersAll, productSearch, productSortField]);

  // Aggregated Sales by Customer
  const customerSales = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; count: number; total: number; lastOrderDate: string; storeCurrency: string }>();
    ordersAll.forEach((o) => {
      const customerNameClean = o.customer_name?.trim() || "Consumidor Final";
      const customerPhoneClean = o.customer_phone?.trim() || "—";
      
      // Group key (prefer phone if exists, otherwise name)
      const key = customerPhoneClean !== "—" ? customerPhoneClean : customerNameClean;
      
      const current = map.get(key) || {
        name: customerNameClean,
        phone: customerPhoneClean,
        count: 0,
        total: 0,
        lastOrderDate: o.created_at,
        storeCurrency: o.currency || "AOA"
      };
      
      current.count += 1;
      current.total += Number(o.total) || 0;
      if (new Date(o.created_at) > new Date(current.lastOrderDate)) {
        current.lastOrderDate = o.created_at;
      }
      map.set(key, current);
    });

    const list = Array.from(map.values());

    // Filter by customer search
    const filtered = list.filter(
      (c) =>
        c.name.toLowerCase().includes(customerReportSearch.toLowerCase().trim()) ||
        c.phone.toLowerCase().includes(customerReportSearch.toLowerCase().trim())
    );

    // Sort
    return filtered.sort((a, b) => {
      if (customerSortField === "count") return b.count - a.count;
      return b.total - a.total;
    });
  }, [ordersAll, customerReportSearch, customerSortField]);

  // Global Period Statistics
  const stats = useMemo(() => {
    const revenue = ordersAll.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const count = ordersAll.length;
    const avgOrderValue = count > 0 ? revenue / count : 0;
    
    let totalItemsSold = 0;
    ordersAll.forEach((o) => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          totalItemsSold += Number(item.qty || 1);
        });
      }
    });

    return {
      revenue,
      count,
      avgOrderValue,
      totalItemsSold,
    };
  }, [ordersAll]);

  const handleExportOrders = (format: "pdf" | "docx") => {
    if (!selectedStore) return;
    if (ordersFiltered.length === 0) {
      toast({ title: "Sem dados para exportar", description: "Não existem registos de vendas com os filtros selecionados.", variant: "destructive" });
      return;
    }
    const rangeLabel = startDate === endDate ? startDate : `${startDate} a ${endDate}`;
    const meta = { storeName: selectedStore.name, dateLabel: rangeLabel, currency: selectedStore.currency };
    if (format === "pdf") exportOrdersPDF(ordersFiltered, meta);
    else exportOrdersDOCX(ordersFiltered, meta);
  };

  const handleExportCSV = (type: "products" | "customers") => {
    if (!selectedStore) return;
    
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = "";

    if (type === "products") {
      headers = ["Produto", "Quantidade Vendida", "Faturação Total", "Moeda"];
      rows = productSales.map((p) => [p.name, p.qty, p.total.toFixed(2), p.storeCurrency]);
      filename = `vendas-por-produto-${selectedStore.name}-${startDate}-a-${endDate}.csv`;
    } else {
      headers = ["Cliente", "Telefone", "Frequência (Pedidos)", "Total Gasto", "Última Compra", "Moeda"];
      rows = customerSales.map((c) => [
        c.name, 
        c.phone, 
        c.count, 
        c.total.toFixed(2), 
        new Date(c.lastOrderDate).toLocaleDateString("pt-PT"),
        c.storeCurrency
      ]);
      filename = `faturacao-por-cliente-${selectedStore.name}-${startDate}-a-${endDate}.csv`;
    }

    const content = [
      headers.join(","),
      ...rows.map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", filename);
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Relatório exportado!", description: `Ficheiro ${filename} guardado com sucesso.` });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Análise & Relatórios de Vendas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Consulte métricas, filtre relatórios detalhados e exporte dados de desempenho de forma instantânea.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder={stores.length === 0 ? "Sem lojas atribuídas" : "Escolha a loja"} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {storeId && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                Intervalo de Análise
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start-date" className="text-xs">Data de Início</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={today}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date" className="text-xs">Data de Fim</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  max={today}
                />
              </div>
            </CardContent>
          </Card>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-xs border-l-4 border-l-emerald-500">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between space-y-0 pb-1">
                  <p className="text-xs font-semibold text-slate-500">Volume de Facturação</p>
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="text-xl font-bold text-emerald-700">
                  {stats.revenue.toFixed(2)} {selectedStore?.currency || "AOA"}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Total bruto faturado no período</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-l-4 border-l-blue-500">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between space-y-0 pb-1">
                  <p className="text-xs font-semibold text-slate-500">Quantidade Pedidos</p>
                  <Receipt className="h-4 w-4 text-blue-500" />
                </div>
                <div className="text-xl font-bold text-blue-700">
                  {stats.count}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Transações / Faturas emitidas</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-l-4 border-l-purple-500">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between space-y-0 pb-1">
                  <p className="text-xs font-semibold text-slate-500">Ticket Médio por Venda</p>
                  <Calculator className="h-4 w-4 text-purple-500" />
                </div>
                <div className="text-xl font-bold text-purple-700">
                  {stats.avgOrderValue.toFixed(2)} {selectedStore?.currency || "AOA"}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Valor médio gasto por cliente</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-l-4 border-l-amber-500">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between space-y-0 pb-1">
                  <p className="text-xs font-semibold text-slate-500">Artigos Vendidos</p>
                  <Package className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-xl font-bold text-amber-700">
                  {stats.totalItemsSold}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Quantidade de unidades saídas</p>
              </CardContent>
            </Card>
          </div>

          {/* Subtabs Select Bar */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
            <Button
              variant={activeTab === "date" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("date")}
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              Por Data / Pedido
            </Button>
            <Button
              variant={activeTab === "product" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("product")}
              className="gap-2"
            >
              <Package className="h-4 w-4" />
              Por Produto
            </Button>
            <Button
              variant={activeTab === "customer" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("customer")}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              Por Cliente
            </Button>
          </div>

          {/* TAB CONTENT: POR DATA */}
          {activeTab === "date" && (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
                <div>
                  <CardTitle className="text-base font-bold">Histórico de Transações</CardTitle>
                  <CardDescription>Lista individualizada de todas as vendas e encomendas processadas.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleExportOrders("pdf")}
                    disabled={ordersFiltered.length === 0}
                    className="gap-1 text-xs"
                  >
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleExportOrders("docx")}
                    disabled={ordersFiltered.length === 0}
                    className="gap-1 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5" /> Word
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search in Date View */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Pesquise por nome de cliente ou telefone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-9 bg-white"
                  />
                </div>

                {isLoading ? (
                  <p className="text-sm text-muted-foreground py-4">A carregar...</p>
                ) : ordersFiltered.length === 0 ? (
                  <div className="text-center py-10 border border-dashed rounded-lg bg-slate-50/50">
                    <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground font-medium">Nenhum pedido registado no período.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg bg-card">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead>Hora/Data</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Contacto</TableHead>
                          <TableHead>Itens Comprados</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-center w-[160px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ordersFiltered.map((o) => {
                          const dateObj = new Date(o.created_at);
                          const dateFmt = dateObj.toLocaleDateString("pt-PT") + " " + dateObj.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
                          const itemSummary = (o.items || []).map((i) => `${i.name} x${i.qty}`).join(", ");
                          return (
                            <TableRow key={o.id} className="hover:bg-slate-50/50">
                              <TableCell className="text-xs font-medium text-slate-600">{dateFmt}</TableCell>
                              <TableCell className="text-xs font-semibold text-slate-900">{o.customer_name || "Consumidor Final"}</TableCell>
                              <TableCell className="text-xs font-mono text-slate-500">{o.customer_phone || "—"}</TableCell>
                              <TableCell className="text-xs text-slate-600 max-w-xs truncate" title={itemSummary}>{itemSummary}</TableCell>
                              <TableCell className="text-xs font-bold text-slate-900 text-right">{Number(o.total).toFixed(2)} {o.currency}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <Button 
                                    size="xs" 
                                    variant="outline" 
                                    className="h-7 text-[11px] gap-1 px-2" 
                                    onClick={() => selectedStore && exportInvoicePDF(o, { storeName: selectedStore.name, dateLabel: startDate, currency: selectedStore.currency, nif: (selectedStore as any).nif, address: (selectedStore as any).address, whatsapp: (selectedStore as any).whatsapp, whatsapp2: (selectedStore as any).whatsapp_2 })}
                                  >
                                    <Receipt className="h-3 w-3" /> PDF
                                  </Button>
                                  <Button 
                                    size="xs" 
                                    variant="outline" 
                                    className="h-7 text-[11px] gap-1 px-2" 
                                    onClick={() => selectedStore && exportInvoiceTicketPDF(o, { storeName: selectedStore.name, dateLabel: startDate, currency: selectedStore.currency, nif: (selectedStore as any).nif, address: (selectedStore as any).address, whatsapp: (selectedStore as any).whatsapp, whatsapp2: (selectedStore as any).whatsapp_2 })}
                                  >
                                    <Receipt className="h-3 w-3" /> Ticket
                                  </Button>
                                  <Button 
                                    size="xs" 
                                    variant="outline" 
                                    className="h-7 text-[11px] gap-1 px-2" 
                                    onClick={() => selectedStore && exportInvoiceDOCX(o, { storeName: selectedStore.name, dateLabel: startDate, currency: selectedStore.currency, nif: (selectedStore as any).nif, address: (selectedStore as any).address, whatsapp: (selectedStore as any).whatsapp, whatsapp2: (selectedStore as any).whatsapp_2 })}
                                  >
                                    <Receipt className="h-3 w-3" /> Word
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB CONTENT: POR PRODUTO */}
          {activeTab === "product" && (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
                <div>
                  <CardTitle className="text-base font-bold">Desempenho por Produto</CardTitle>
                  <CardDescription>Análise acumulada das quantidades e faturação de cada produto vendido.</CardDescription>
                </div>
                <div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleExportCSV("products")}
                    disabled={productSales.length === 0}
                    className="gap-2 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar Excel/CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search & Sort controls */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Pesquise por nome do produto..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="pl-9 bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0 text-slate-500">Ordenar por:</Label>
                    <Select value={productSortField} onValueChange={(v) => setProductSortField(v as "qty" | "total")}>
                      <SelectTrigger className="w-[150px] bg-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Faturação Total</SelectItem>
                        <SelectItem value="qty">Quantidade Vendida</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isLoading ? (
                  <p className="text-sm text-muted-foreground py-4">A carregar...</p>
                ) : productSales.length === 0 ? (
                  <div className="text-center py-10 border border-dashed rounded-lg bg-slate-50/50">
                    <Package className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground font-medium">Nenhum produto vendido no período.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg bg-card">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead className="w-[80px] text-center">Posição</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-center w-[180px]">Quantidade Vendida</TableHead>
                          <TableHead className="text-right w-[180px]">Faturação Acumulada</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productSales.map((p, index) => (
                          <TableRow key={p.id} className="hover:bg-slate-50/50">
                            <TableCell className="text-center font-bold text-xs text-slate-500">#{index + 1}</TableCell>
                            <TableCell className="text-xs font-semibold text-slate-900">{p.name}</TableCell>
                            <TableCell className="text-center text-xs font-bold text-slate-700 bg-slate-50/50">{p.qty} un.</TableCell>
                            <TableCell className="text-xs font-bold text-emerald-700 text-right">{p.total.toFixed(2)} {p.storeCurrency}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB CONTENT: POR CLIENTE */}
          {activeTab === "customer" && (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
                <div>
                  <CardTitle className="text-base font-bold">Ranking de Clientes</CardTitle>
                  <CardDescription>Identifique os seus melhores clientes por volume de compras e gastos.</CardDescription>
                </div>
                <div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleExportCSV("customers")}
                    disabled={customerSales.length === 0}
                    className="gap-2 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar Excel/CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search & Sort controls */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Pesquise por nome do cliente ou contacto..."
                      value={customerReportSearch}
                      onChange={(e) => setCustomerReportSearch(e.target.value)}
                      className="pl-9 bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0 text-slate-500">Ordenar por:</Label>
                    <Select value={customerSortField} onValueChange={(v) => setCustomerSortField(v as "count" | "total")}>
                      <SelectTrigger className="w-[150px] bg-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Total Gasto</SelectItem>
                        <SelectItem value="count">Frequência (Nº Compras)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isLoading ? (
                  <p className="text-sm text-muted-foreground py-4">A carregar...</p>
                ) : customerSales.length === 0 ? (
                  <div className="text-center py-10 border border-dashed rounded-lg bg-slate-50/50">
                    <Users className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground font-medium">Nenhum cliente registado no período.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg bg-card">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead className="w-[80px] text-center">Posição</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Contacto</TableHead>
                          <TableHead className="text-center w-[150px]">Frequência</TableHead>
                          <TableHead className="text-right w-[180px]">Total Gasto</TableHead>
                          <TableHead className="text-right w-[150px]">Última Compra</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerSales.map((c, index) => (
                          <TableRow key={index} className="hover:bg-slate-50/50">
                            <TableCell className="text-center font-bold text-xs text-slate-500">#{index + 1}</TableCell>
                            <TableCell className="text-xs font-semibold text-slate-900">{c.name}</TableCell>
                            <TableCell className="text-xs font-mono text-slate-500">{c.phone}</TableCell>
                            <TableCell className="text-center text-xs font-bold text-slate-700 bg-slate-50/50">{c.count} pedidos</TableCell>
                            <TableCell className="text-xs font-bold text-emerald-700 text-right">{c.total.toFixed(2)} {c.storeCurrency}</TableCell>
                            <TableCell className="text-xs text-slate-500 text-right">{new Date(c.lastOrderDate).toLocaleDateString("pt-PT")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
