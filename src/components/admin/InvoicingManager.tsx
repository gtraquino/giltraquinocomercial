import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, FileText, Settings, CreditCard, Receipt, FileDown, ShoppingBag } from "lucide-react";
import { parseProductDescription } from "@/utils/stock";
import { exportInvoicePDF, exportInvoiceDOCX, OrderRecord } from "@/lib/reportExport";

interface InvoiceSettings {
  companyName: string;
  companyNif: string;
  address: string;
  phone: string;
  email: string;
  ivaRate: string;
  prefix: string;
}

const defaultSettings = (storeName: string): InvoiceSettings => ({
  companyName: storeName || "",
  companyNif: "",
  address: "",
  phone: "",
  email: "",
  ivaRate: "0",
  prefix: "FT/",
});

export default function InvoicingManager() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [subTab, setSubTab] = useState<"list" | "create" | "settings">("list");

  // Manual invoice creation state
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientNif, setClientNif] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [invoiceItems, setInvoiceItems] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);

  // Settings state
  const [settings, setSettings] = useState<InvoiceSettings>(defaultSettings(""));

  const { data: stores = [] } = useQuery({
    queryKey: ["stores-scoped-invoicing", isAdmin, user?.id],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.from("stores").select("*").order("name");
        if (error) throw error;
        return data;
      }
      const { data: mgr, error: mgrErr } = await supabase
        .from("store_managers").select("store_id").eq("user_id", user!.id);
      if (mgrErr) throw mgrErr;
      const ids = (mgr ?? []).map((m) => m.store_id);
      if (ids.length === 0) return [];
      const { data, error = null } = await supabase.from("stores").select("*").in("id", ids).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  // Auto-select first store
  useEffect(() => {
    if (stores && stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  // Load Invoicing Settings from LocalStorage
  useEffect(() => {
    if (selectedStoreId && selectedStore) {
      const saved = localStorage.getItem(`invoice_settings_${selectedStoreId}`);
      if (saved) {
        try {
          setSettings(JSON.parse(saved));
        } catch (e) {
          setSettings(defaultSettings(selectedStore.name));
        }
      } else {
        setSettings(defaultSettings(selectedStore.name));
      }
    }
  }, [selectedStoreId, selectedStore]);

  // Query products for POS dropdown
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-invoicing", selectedStoreId],
    queryFn: async () => {
      if (!selectedStoreId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", selectedStoreId)
        .eq("in_stock", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStoreId,
  });

  // Query past orders/invoices
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["orders-invoicing", selectedStoreId],
    queryFn: async () => {
      if (!selectedStoreId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", selectedStoreId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStoreId,
  });

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    localStorage.setItem(`invoice_settings_${selectedStoreId}`, JSON.stringify(settings));
    toast({ title: "Configurações guardadas", description: "Os dados de faturação foram atualizados." });
  };

  const handleAddItem = () => {
    if (!selectedProductId) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const { stockQty } = parseProductDescription(prod.description);
    
    // Check if product is already in the manual invoice
    const existing = invoiceItems.find((item) => item.id === prod.id);
    const currentQty = existing ? existing.qty : 0;
    const requestedQty = currentQty + itemQty;

    if (stockQty !== null && requestedQty > stockQty) {
      toast({
        title: "Stock insuficiente",
        description: `Só restam ${stockQty} unidades deste produto em stock.`,
        variant: "destructive",
      });
      return;
    }

    if (existing) {
      setInvoiceItems(
        invoiceItems.map((item) =>
          item.id === prod.id ? { ...item, qty: requestedQty } : item
        )
      );
    } else {
      setInvoiceItems([
        ...invoiceItems,
        { id: prod.id, name: prod.name, price: Number(prod.price), qty: itemQty },
      ]);
    }

    setSelectedProductId("");
    setItemQty(1);
    toast({ title: "Item adicionado à fatura" });
  };

  const handleRemoveItem = (id: string) => {
    setInvoiceItems(invoiceItems.filter((item) => item.id !== id));
  };

  const total = invoiceItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (invoiceItems.length === 0 || !selectedStoreId) return;

      // Calculate totals
      const subtotalBase = total;

      // Format custom client NIF or details if specified
      const customerNameFull = clientNif ? `${clientName.trim()} (NIF: ${clientNif.trim()})` : clientName.trim();

      // Create order/invoice payload
      const orderPayload = {
        store_id: selectedStoreId,
        customer_name: customerNameFull,
        customer_phone: clientPhone.trim(),
        items: invoiceItems.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })) as any,
        total: subtotalBase,
        currency: selectedStore?.currency || "AOA",
      };

      const { data, error } = await supabase.from("orders").insert(orderPayload).select().single();
      if (error) throw error;

      const lowStockWarnings: { name: string; qty: number }[] = [];

      // Decrement stock levels locally using identical trigger loop
      for (const item of invoiceItems) {
        try {
          const { data: prod, error: fetchErr } = await supabase
            .from("products")
            .select("description, in_stock")
            .eq("id", item.id)
            .single();
          if (fetchErr || !prod) continue;

          const { cleanDescription, stockQty } = parseProductDescription(prod.description);
          if (stockQty !== null) {
            const newQty = Math.max(0, stockQty - item.qty);
            const updatedDescription = formatProductDescription(cleanDescription, newQty);
            const updatedInStock = newQty > 0;

            await supabase
              .from("products")
              .update({
                description: updatedDescription,
                in_stock: updatedInStock
              })
              .eq("id", item.id);

            if (newQty <= 5) {
              lowStockWarnings.push({ name: item.name, qty: newQty });
            }
          }
        } catch (e) {
          console.error("Error decrementing stock on manual sale:", e);
        }
      }

      return { order: data, lowStockWarnings };
    },
    onSuccess: (result) => {
      const { order: newOrder, lowStockWarnings } = result;
      queryClient.invalidateQueries({ queryKey: ["orders-invoicing", selectedStoreId] });
      queryClient.invalidateQueries({ queryKey: ["products", selectedStoreId] });
      queryClient.invalidateQueries({ queryKey: ["products-for-invoicing", selectedStoreId] });

      // Generate PDF Invoice
      if (newOrder && selectedStore) {
        const orderRecord: OrderRecord = {
          id: newOrder.id,
          created_at: newOrder.created_at,
          customer_name: clientName.trim() + (clientNif ? ` (NIF: ${clientNif})` : ""),
          customer_phone: clientPhone.trim(),
          items: invoiceItems,
          total,
          currency: selectedStore.currency || "AOA",
        };

        const reportMeta = {
          storeName: settings.companyName || selectedStore.name,
          dateLabel: new Date(newOrder.created_at).toLocaleDateString("pt-PT"),
          currency: selectedStore.currency || "AOA",
          nif: settings.companyNif || null,
          address: settings.address || null,
          whatsapp: settings.phone || selectedStore.whatsapp || null,
          whatsapp2: null,
          email: settings.email || null,
          ivaRate: settings.ivaRate || "0",
          prefix: settings.prefix || "FT",
        };

        exportInvoicePDF(orderRecord, reportMeta);
      }

      // Reset Create Form
      setClientName("");
      setClientPhone("");
      setClientNif("");
      setInvoiceItems([]);
      setSubTab("list");
      
      toast({ 
        title: "Fatura emitida com sucesso!", 
        description: "O stock foi decrementado e o PDF gerado." 
      });

      // Show warnings for low/out-of-stock items
      if (lowStockWarnings.length > 0) {
        lowStockWarnings.forEach((warning, index) => {
          setTimeout(() => {
            toast({
              title: warning.qty === 0 ? "🚨 Produto Esgotado!" : "⚠️ Alerta: Stock Mínimo Atingido!",
              description: warning.qty === 0 
                ? `O produto "${warning.name}" está agora totalmente sem stock!` 
                : `O produto "${warning.name}" tem apenas ${warning.qty} unidades restantes no stock!`,
              variant: "destructive"
            });
          }, 200 * (index + 1));
        });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao emitir fatura", description: e.message, variant: "destructive" });
    },
  });

  const handleDownloadInvoice = (order: any) => {
    if (!selectedStore) return;
    const orderRecord: OrderRecord = {
      id: order.id,
      created_at: order.created_at,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      items: order.items,
      total: order.total,
      currency: order.currency,
    };

    const reportMeta = {
      storeName: settings.companyName || selectedStore.name,
      dateLabel: new Date(order.created_at).toLocaleDateString("pt-PT"),
      currency: order.currency,
      nif: settings.companyNif || null,
      address: settings.address || null,
      whatsapp: settings.phone || selectedStore.whatsapp || null,
      whatsapp2: null,
      email: settings.email || null,
      ivaRate: settings.ivaRate || "0",
      prefix: settings.prefix || "FT",
    };

    exportInvoicePDF(orderRecord, reportMeta);
  };

  const handleDownloadInvoiceDocx = (order: any) => {
    if (!selectedStore) return;
    const orderRecord: OrderRecord = {
      id: order.id,
      created_at: order.created_at,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      items: order.items,
      total: order.total,
      currency: order.currency,
    };

    const reportMeta = {
      storeName: settings.companyName || selectedStore.name,
      dateLabel: new Date(order.created_at).toLocaleDateString("pt-PT"),
      currency: order.currency,
      nif: settings.companyNif || null,
      address: settings.address || null,
      whatsapp: settings.phone || selectedStore.whatsapp || null,
      whatsapp2: null,
      email: settings.email || null,
      ivaRate: settings.ivaRate || "0",
      prefix: settings.prefix || "FT",
    };

    exportInvoiceDOCX(orderRecord, reportMeta);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Facturação & POS</h2>
          <p className="text-sm text-muted-foreground mt-1">Eita faturas, vendas no ponto de venda física e controlo fiscal.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Selecione uma loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedStoreId && (
        <div className="space-y-6">
          {/* Subtabs bar */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
            <Button
              variant={subTab === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSubTab("list")}
              className="gap-2"
            >
              <Receipt className="h-4 w-4" />
              Histórico de Vendas
            </Button>
            <Button
              variant={subTab === "create" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSubTab("create")}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Emitir Nova Fatura (POS)
            </Button>
            <Button
              variant={subTab === "settings" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSubTab("settings")}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Dados de Facturação
            </Button>
          </div>

          {/* Subtab Content: List Invoices */}
          {subTab === "list" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Documentos Emitidos</CardTitle>
                <CardDescription>Consulte e exporte as faturas geradas de encomendas online e vendas manuais.</CardDescription>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="animate-pulse space-y-2 py-4">
                    {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded" />)}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-12 border border-dashed rounded-lg">
                    <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-medium">Nenhuma venda registada até ao momento.</p>
                    <Button variant="outline" size="sm" onClick={() => setSubTab("create")} className="mt-4 gap-2">
                      <Plus className="h-4 w-4" /> Registar primeira venda
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nº Documento</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Contacto</TableHead>
                          <TableHead>Itens</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead className="text-right">Exportar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((o) => {
                          const docNo = o.id.slice(0, 8).toUpperCase();
                          const dateStr = new Date(o.created_at).toLocaleDateString("pt-PT", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          });
                          const itemsCount = o.items ? o.items.reduce((acc: number, item: any) => acc + (item.qty || 1), 0) : 0;
                          return (
                            <TableRow key={o.id}>
                              <TableCell className="font-mono font-bold text-xs">{settings.prefix || "FT/"}{docNo}</TableCell>
                              <TableCell className="text-xs">{dateStr}</TableCell>
                              <TableCell className="font-medium text-xs">{o.customer_name || "Consumidor Final"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{o.customer_phone || "—"}</TableCell>
                              <TableCell className="text-xs">{itemsCount} un. ({o.items?.length || 0} prod.)</TableCell>
                              <TableCell className="font-semibold text-xs">{Number(o.total).toFixed(2)} {o.currency}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1 text-xs"
                                    onClick={() => handleDownloadInvoice(o)}
                                  >
                                    <FileDown className="h-3.5 w-3.5" /> PDF
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1 text-xs"
                                    onClick={() => handleDownloadInvoiceDocx(o)}
                                  >
                                    <FileText className="h-3.5 w-3.5" /> Word
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

          {/* Subtab Content: POS / Create Invoice */}
          {subTab === "create" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* POS Controls */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Registar Venda / Emitir Fatura</CardTitle>
                    <CardDescription>Adicione produtos, quantifique o inventário e preencha os dados fiscais.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Item Adder Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 items-end">
                      <div className="sm:col-span-1.5 space-y-1">
                        <Label htmlFor="product-select" className="text-xs">Selecione o Produto</Label>
                        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                          <SelectTrigger id="product-select">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => {
                              const { stockQty } = parseProductDescription(p.description);
                              return (
                                <SelectItem key={p.id} value={p.id} disabled={stockQty !== null && stockQty <= 0}>
                                  {p.name} ({Number(p.price).toFixed(2)} {selectedStore?.currency}) {stockQty !== null ? `[Stock: ${stockQty}]` : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="qty-select" className="text-xs">Quantidade</Label>
                        <Input
                          id="qty-select"
                          type="number"
                          min={1}
                          value={itemQty}
                          onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                      </div>

                      <Button type="button" onClick={handleAddItem} className="gap-2">
                        <Plus className="h-4 w-4" /> Adicionar
                      </Button>
                    </div>

                    {/* Current Invoice List */}
                    {invoiceItems.length === 0 ? (
                      <div className="text-center py-10 border rounded-lg bg-slate-50/50">
                        <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/60 mb-2" />
                        <p className="text-muted-foreground text-sm font-medium">Nenhum item adicionado à fatura.</p>
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden bg-card">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead>Produto</TableHead>
                              <TableHead>Preço Unitário</TableHead>
                              <TableHead>Qtd</TableHead>
                              <TableHead>Subtotal</TableHead>
                              <TableHead className="w-[60px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoiceItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium text-xs">{item.name}</TableCell>
                                <TableCell className="text-xs">{item.price.toFixed(2)} {selectedStore?.currency}</TableCell>
                                <TableCell className="text-xs font-bold">{item.qty}</TableCell>
                                <TableCell className="text-xs font-semibold">{(item.price * item.qty).toFixed(2)} {selectedStore?.currency}</TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => handleRemoveItem(item.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Client and Submit Form */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Dados do Cliente & Resumo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="client-name" className="text-xs">Nome do Cliente</Label>
                      <Input
                        id="client-name"
                        placeholder="Ex: Gil Traquino"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="client-phone" className="text-xs">Telemóvel / Contacto</Label>
                      <Input
                        id="client-phone"
                        placeholder="Ex: 923456789"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="client-nif" className="text-xs">NIF / NUIT do Cliente (Opcional)</Label>
                      <Input
                        id="client-nif"
                        placeholder="Ex: 500094830"
                        value={clientNif}
                        onChange={(e) => setClientNif(e.target.value)}
                      />
                    </div>

                    <div className="border-t pt-4 space-y-2.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Valor Tributável:</span>
                        <span>{total.toFixed(2)} {selectedStore?.currency}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">IVA ({settings.ivaRate}%):</span>
                        <span>{((total * Number(settings.ivaRate || "0")) / 100).toFixed(2)} {selectedStore?.currency}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold border-t pt-2.5">
                        <span>Total Geral:</span>
                        <span>{(total + (total * Number(settings.ivaRate || "0")) / 100).toFixed(2)} {selectedStore?.currency}</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      disabled={invoiceItems.length === 0 || createInvoiceMutation.isPending}
                      onClick={() => createInvoiceMutation.mutate()}
                      className="w-full mt-4 gap-2"
                    >
                      <Receipt className="h-4 w-4" />
                      {createInvoiceMutation.isPending ? "A processar..." : "Emitir Fatura & Descarregar PDF"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Subtab Content: Settings */}
          {subTab === "settings" && (
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle className="text-lg">Dados do Emissor / Loja</CardTitle>
                <CardDescription>Estes dados serão apresentados no topo das faturas emitidas da sua loja.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveSettings} className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="firm-name">Nome da Empresa / Designação Comercial</Label>
                    <Input
                      id="firm-name"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="firm-nif">NIF / NUIT</Label>
                      <Input
                        id="firm-nif"
                        placeholder="Ex: 540209483"
                        value={settings.companyNif}
                        onChange={(e) => setSettings({ ...settings, companyNif: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="firm-iva">Taxa de IVA Padrão (%)</Label>
                      <Input
                        id="firm-iva"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.ivaRate}
                        onChange={(e) => setSettings({ ...settings, ivaRate: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="firm-tel">Contacto de Telefone</Label>
                      <Input
                        id="firm-tel"
                        value={settings.phone}
                        onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="firm-email">Correio Eletrónico (Email)</Label>
                      <Input
                        id="firm-email"
                        type="email"
                        value={settings.email}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="invoice-prefix">Prefixo da Fatura</Label>
                      <Input
                        id="invoice-prefix"
                        value={settings.prefix}
                        onChange={(e) => setSettings({ ...settings, prefix: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1 flex items-end">
                      <p className="text-xs text-muted-foreground pb-2">Exemplo: FT 2026/0001</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="firm-address">Endereço Fiscal</Label>
                    <Input
                      id="firm-address"
                      value={settings.address}
                      onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    />
                  </div>

                  <Button type="submit" className="gap-2">
                    <Settings className="h-4 w-4" /> Guardar Dados
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
