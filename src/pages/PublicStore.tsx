import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Store, ShoppingBag, Send, Save, X, Phone, Clock, Lock, Smartphone, CheckCircle2, Loader2, CreditCard, Wallet, Banknote } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { isStoreBlocked } from "@/lib/billing";
import { parseProductDescription, formatProductDescription } from "@/utils/stock";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

type StoreProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
};

export default function PublicStore() {
  const { storeId } = useParams<{ storeId: string }>();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const [qty, setQty] = useState<number>(1);

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["public-store", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").eq("id", storeId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["public-products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("store_id", storeId!).eq("in_stock", true).order("category", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });

  const openProduct = (p: StoreProduct) => {
    const existing = cart.find((c) => c.id === p.id);
    setSelected(p);
    setQty(existing ? existing.qty : 1);
  };

  const closeDialog = () => {
    setSelected(null);
    setQty(1);
  };

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mcx" | "cash" | "transfer" | "tpa">("mcx");
  const [mcxDialog, setMcxDialog] = useState<{
    isOpen: boolean;
    step: "pending" | "success" | "failed";
    phone: string;
    total: number;
    items: CartItem[];
    onComplete: (refCode: string) => void;
    timer: number;
  } | null>(null);

  // Reusable payment selector grid
  const renderPaymentSelector = () => {
    return (
      <div className="space-y-2 pb-1">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Forma de Pagamento</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("mcx")}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${paymentMethod === "mcx" ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "border-muted hover:bg-slate-50"}`}
          >
            <Smartphone className="h-4 w-4 mb-1 text-blue-600" />
            <span className="text-[11px] font-bold">MCX Express</span>
            <span className="text-[9px] text-muted-foreground">Telemóvel (AO)</span>
          </button>
          
          <button
            type="button"
            onClick={() => setPaymentMethod("cash")}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${paymentMethod === "cash" ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "border-muted hover:bg-slate-50"}`}
          >
            <Banknote className="h-4 w-4 mb-1 text-emerald-600" />
            <span className="text-[11px] font-bold">Dinheiro</span>
            <span className="text-[9px] text-muted-foreground">Na entrega</span>
          </button>
          
          <button
            type="button"
            onClick={() => setPaymentMethod("transfer")}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${paymentMethod === "transfer" ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "border-muted hover:bg-slate-50"}`}
          >
            <Wallet className="h-4 w-4 mb-1 text-amber-600" />
            <span className="text-[11px] font-bold">IBAN / Transfer.</span>
            <span className="text-[9px] text-muted-foreground">Enviar comprovativo</span>
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod("tpa")}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${paymentMethod === "tpa" ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "border-muted hover:bg-slate-50"}`}
          >
            <CreditCard className="h-4 w-4 mb-1 text-indigo-600" />
            <span className="text-[11px] font-bold">Multicaixa TPA</span>
            <span className="text-[9px] text-muted-foreground">Cartão na entrega</span>
          </button>
        </div>
      </div>
    );
  };

  const startMcxPayment = (itemsToPay: CartItem[], totalToPay: number, triggerComplete: (ref: string) => void) => {
    setMcxDialog({
      isOpen: true,
      step: "pending",
      phone: customerPhone.trim(),
      total: totalToPay,
      items: itemsToPay,
      onComplete: triggerComplete,
      timer: 15,
    });
  };

  const saveToCart = () => {
    if (!selected) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === selected.id);
      if (existing) {
        return prev.map((c) => c.id === selected.id ? { ...c, qty } : c);
      }
      return [...prev, { id: selected.id, name: selected.name, price: Number(selected.price), qty }];
    });
    toast({ title: "Guardado no carrinho", description: `${selected.name} x${qty}` });
    closeDialog();
  };

  const openWhatsApp = (phone: string, text: string) => {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const validateCustomer = (): boolean => {
    if (!customerName.trim() || customerName.trim().length < 2) {
      toast({ title: "Indique o seu nome", variant: "destructive" });
      return false;
    }
    const digits = customerPhone.replace(/[^0-9]/g, "");
    if (digits.length < 7) {
      toast({ title: "Indique um contacto válido", variant: "destructive" });
      return false;
    }
    return true;
  };

  const sendToAllNumbers = (msg: string) => {
    if (!store) return;
    const phones = [store.whatsapp, (store as any).whatsapp_2]
      .filter((p): p is string => !!p && p.trim().length > 0)
      .map((p) => p.replace(/[^0-9]/g, ""))
      .filter((p) => p.length > 0);
    if (phones.length === 0) return;
    openWhatsApp(phones[0], msg);
    phones.slice(1).forEach((p, i) => {
      setTimeout(() => openWhatsApp(p, msg), 600 * (i + 1));
    });
  };

  // Handle MCX countdown timer
  useState(() => {
    const checkTimer = setInterval(() => {
      setMcxDialog((prev) => {
        if (!prev || !prev.isOpen || prev.step !== "pending") return prev;
        if (prev.timer <= 1) {
          return { ...prev, step: "success", timer: 0 };
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);
    return () => clearInterval(checkTimer);
  });

  const persistOrder = async (
    items: CartItem[], 
    total: number, 
    payMethod: "mcx" | "cash" | "transfer" | "tpa",
    mcxRef?: string
  ): Promise<boolean> => {
    if (!store) return false;

    // Live-check store block status before any database write or proceeding to prevent bypassed orders
    try {
      const { data: latestStore, error: storeErr } = await supabase
        .from("stores")
        .select("is_blocked, paid_until")
        .eq("id", store.id)
        .single();

      if (storeErr || !latestStore || isStoreBlocked(latestStore as any)) {
        toast({
          title: "Loja temporariamente indisponível",
          description: "Esta loja está fora de serviço (subscrição expirada ou suspensa) e não pode receber novos pedidos.",
          variant: "destructive",
        });
        return false;
      }
    } catch (e) {
      console.error("Erro ao verificar estado da loja:", e);
      return false;
    }

    // Append payment method info in name for clean dashboard viewing
    let nameWithPayment = customerName.trim();
    if (payMethod === "mcx") {
      nameWithPayment += ` [MCX Express: Pago - Ref ${mcxRef || "OK"}]`;
    } else if (payMethod === "cash") {
      nameWithPayment += ` [Dinheiro]`;
    } else if (payMethod === "transfer") {
      nameWithPayment += ` [Trf. IBAN]`;
    } else if (payMethod === "tpa") {
      nameWithPayment += ` [Multicaixa TPA]`;
    }

    const { error } = await supabase.from("orders").insert({
      store_id: store.id,
      customer_name: nameWithPayment,
      customer_phone: customerPhone.trim(),
      items: items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })) as any,
      total,
      currency: store.currency,
    });
    if (error) {
      toast({ title: "Aviso", description: "Pedido enviado mas não foi possível gravar para relatório.", variant: "destructive" });
    }

    // Decrement stock for each item ordered
    for (const item of items) {
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
        }
      } catch (e) {
        console.error("Error updating stock quantity:", e);
      }
    }

    return true;
  };

  const orderNow = async () => {
    if (!selected || !store) return;
    if (!validateCustomer()) return;
    const lineTotal = Number(selected.price) * qty;
    const item: CartItem = { id: selected.id, name: selected.name, price: Number(selected.price), qty };

    if (paymentMethod === "mcx") {
      startMcxPayment([item], lineTotal, async (refCode) => {
        const success = await persistOrder([item], lineTotal, "mcx", refCode);
        if (!success) return;
        const msg = `Olá! Novo pedido na loja *${store.name}*:\n\n*Cliente:* ${customerName.trim()}\n*Contacto:* ${customerPhone.trim()}\n*Método de Pagamento:* Multicaixa Express (PAGO) 📱✅\n*Referência MCX:* ${refCode}\n\n- ${selected.name} x${qty}: ${lineTotal.toFixed(2)} ${store.currency}\n\n*Total: ${lineTotal.toFixed(2)} ${store.currency}*`;
        sendToAllNumbers(msg);
        closeDialog();
      });
    } else {
      const success = await persistOrder([item], lineTotal, paymentMethod);
      if (!success) return;
      const paymentLabels = {
        cash: "Dinheiro 💵",
        transfer: "Transferência / IBAN 🏦",
        tpa: "Multicaixa TPA 💳"
      };
      const label = paymentLabels[paymentMethod] || paymentMethod;
      const msg = `Olá! Novo pedido na loja *${store.name}*:\n\n*Cliente:* ${customerName.trim()}\n*Contacto:* ${customerPhone.trim()}\n*Método de Pagamento:* ${label}\n\n- ${selected.name} x${qty}: ${lineTotal.toFixed(2)} ${store.currency}\n\n*Total: ${lineTotal.toFixed(2)} ${store.currency}*`;
      sendToAllNumbers(msg);
      closeDialog();
    }
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  const sendCartOrder = async () => {
    if (!store || cart.length === 0) return;
    if (!validateCustomer()) return;
    let items = "";
    cart.forEach((c) => {
      items += `- ${c.name} x${c.qty}: ${(c.price * c.qty).toFixed(2)} ${store.currency}\n`;
    });

    if (paymentMethod === "mcx") {
      startMcxPayment(cart, total, async (refCode) => {
        const success = await persistOrder(cart, total, "mcx", refCode);
        if (!success) return;
        const msg = `Olá! Novo pedido na loja *${store.name}*:\n\n*Cliente:* ${customerName.trim()}\n*Contacto:* ${customerPhone.trim()}\n*Método de Pagamento:* Multicaixa Express (PAGO) 📱✅\n*Referência MCX:* ${refCode}\n\n${items}\n*Total: ${total.toFixed(2)} ${store.currency}*`;
        sendToAllNumbers(msg);
        setCart([]);
      });
    } else {
      const success = await persistOrder(cart, total, paymentMethod);
      if (!success) return;
      const paymentLabels = {
        cash: "Dinheiro 💵",
        transfer: "Transferência / IBAN 🏦",
        tpa: "Multicaixa TPA 💳"
      };
      const label = paymentLabels[paymentMethod] || paymentMethod;
      const msg = `Olá! Novo pedido na loja *${store.name}*:\n\n*Cliente:* ${customerName.trim()}\n*Contacto:* ${customerPhone.trim()}\n*Método de Pagamento:* ${label}\n\n${items}\n*Total: ${total.toFixed(2)} ${store.currency}*`;
      sendToAllNumbers(msg);
      setCart([]);
    }
  };

  const isLoading = storeLoading || productsLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <Store className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Loja não encontrada</h1>
          <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  if (isStoreBlocked(store as any)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <div className="text-center max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Loja temporariamente indisponível</h1>
          <p className="text-muted-foreground">
            Esta loja está temporariamente fora de serviço. Por favor tente novamente mais tarde.
          </p>
        </div>
      </div>
    );
  }

  const categories = [...new Set(products.map((p) => p.category || "Outros"))];

  const themeStyle = (store.primary_color || store.accent_color) ? {
    ["--primary" as any]: store.primary_color || undefined,
    ["--accent" as any]: store.accent_color || store.primary_color || undefined,
    ["--ring" as any]: store.primary_color || undefined,
    backgroundColor: `hsl(${store.primary_color || store.accent_color} / 0.04)`,
  } as React.CSSProperties : undefined;

  const heroColor = store.primary_color || store.accent_color;
  const heroStyle: React.CSSProperties = heroColor
    ? {
        backgroundColor: `hsl(${heroColor} / 0.12)`,
        color: `hsl(${heroColor})`,
        borderBottom: `1px solid hsl(${heroColor} / 0.2)`,
      }
    : {};
  const logoBgStyle: React.CSSProperties = heroColor
    ? { backgroundColor: `hsl(${heroColor} / 0.18)` }
    : {};
  const subtitleStyle: React.CSSProperties = heroColor
    ? { color: `hsl(${heroColor} / 0.75)` }
    : {};
  const watermarkStyle: React.CSSProperties = heroColor
    ? { color: `hsl(${heroColor} / 0.07)` }
    : { color: "hsl(var(--foreground) / 0.05)" };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden" style={themeStyle}>
      {/* Sombreado com nome da loja */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 flex items-center justify-center z-0 select-none"
        style={watermarkStyle}
      >
        <span className="font-extrabold tracking-tight text-[11vw] md:text-[9vw] leading-none whitespace-nowrap">
          {store.name}
        </span>
      </div>

      {/* Hero */}
      <div className="relative z-10 px-4 py-10 md:py-16" style={heroStyle}>
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-4 flex h-64 w-64 md:h-80 md:w-80 items-center justify-center rounded-full overflow-hidden" style={logoBgStyle}>
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.name} className="h-full w-full object-cover" />
            ) : (
              <Store className="h-16 w-16" />
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{store.name}</h1>
          {(store as any).hero_title && (
            <p className="text-base md:text-lg font-medium mb-2" style={subtitleStyle}>
              {(store as any).hero_title}
            </p>
          )}
          <p className="capitalize" style={subtitleStyle}>{store.type} • {store.currency}</p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm" style={subtitleStyle}>
            {store.whatsapp && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-4 w-4" />
                {store.whatsapp}
              </span>
            )}
            {(store as any).whatsapp_2 && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-4 w-4" />
                {(store as any).whatsapp_2}
              </span>
            )}
            {((store as any).opening_time || (store as any).closing_time) && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {(store as any).opening_time || "--:--"} – {(store as any).closing_time || "--:--"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-4xl p-4 md:p-6 pb-32">
        {products.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum produto disponível no momento.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((cat) => (
              <div key={cat}>
                <h2 className="text-lg font-semibold mb-3 border-b pb-2">{cat}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {products.filter((p) => (p.category || "Outros") === cat).map((p) => {
                    const inCart = cart.find((c) => c.id === p.id);
                    const { cleanDescription, stockQty } = parseProductDescription(p.description);
                    return (
                      <Card
                        key={p.id}
                        className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
                        onClick={() => openProduct(p as StoreProduct)}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="h-16 w-16 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium truncate">{p.name}</h3>
                            {cleanDescription && <p className="text-sm text-muted-foreground line-clamp-1">{cleanDescription}</p>}
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-sm font-semibold">{Number(p.price).toFixed(2)} {store.currency}</p>
                              {stockQty !== null && (
                                <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${stockQty === 0 ? "bg-red-50 text-red-600" : stockQty <= 3 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-slate-50 text-slate-500"}`}>
                                  {stockQty === 0 ? "Esgotado" : `${stockQty} un.`}
                                </span>
                              )}
                            </div>
                          </div>
                          {inCart && (
                            <span className="shrink-0 rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-1">
                              x{inCart.qty}
                            </span>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cart summary */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 inset-x-0 bg-card border-t shadow-lg p-4 z-40">
            <div className="mx-auto max-w-4xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="O seu nome *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  maxLength={80}
                />
                <Input
                  type="tel"
                  placeholder="O seu contacto *"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  maxLength={20}
                />
              </div>
              {renderPaymentSelector()}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{cart.reduce((s, c) => s + c.qty, 0)} itens</p>
                  <p className="text-lg font-bold">{total.toFixed(2)} {store.currency}</p>
                </div>
                <Button onClick={sendCartOrder} size="lg" className="gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Encomendar via WhatsApp
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto pb-20 sm:pb-6">
          {selected && (() => {
            const { cleanDescription, stockQty } = parseProductDescription(selected.description);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{selected.name}</DialogTitle>
                  {cleanDescription && (
                    <DialogDescription>{cleanDescription}</DialogDescription>
                  )}
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {selected.image_url && (
                    <img src={selected.image_url} alt={selected.name} className="w-full h-48 object-cover rounded-lg" />
                  )}
                  
                  {stockQty !== null && (
                    <div className={`text-xs p-2.5 rounded-lg border flex items-center justify-between ${stockQty === 0 ? "bg-red-50 border-red-100 text-red-700" : stockQty <= 3 ? "bg-amber-50 border-amber-100 text-amber-700 font-medium animate-pulse" : "bg-slate-50 border-slate-100 text-slate-600"}`}>
                      <span>Inventário disponível:</span>
                      <span className="font-bold">{stockQty} unidades</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Preço unitário</span>
                    <span className="font-semibold">
                      {Number(selected.price).toFixed(2)} {store.currency}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qty">Quantidade</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                      >
                        −
                      </Button>
                      <Input
                        id="qty"
                        type="number"
                        min={1}
                        max={stockQty !== null ? stockQty : undefined}
                        value={qty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setQty(Math.max(1, stockQty !== null ? Math.min(stockQty, val) : val));
                        }}
                        className="text-center"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setQty((q) => stockQty !== null ? Math.min(stockQty, q + 1) : q + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="text-lg font-bold">
                      {(Number(selected.price) * qty).toFixed(2)} {store.currency}
                    </span>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <Label htmlFor="cust-name">O seu nome *</Label>
                    <Input
                      id="cust-name"
                      placeholder="Nome completo"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      maxLength={80}
                    />
                    <Label htmlFor="cust-phone">O seu contacto *</Label>
                    <Input
                      id="cust-phone"
                      type="tel"
                      placeholder="Ex: 244923456789"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      maxLength={20}
                    />
                    <p className="text-xs text-muted-foreground">Obrigatório para enviar o pedido via WhatsApp.</p>
                  </div>
                  <div className="border-t pt-3">
                    {renderPaymentSelector()}
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
                  <Button
                    variant="outline"
                    onClick={closeDialog}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={saveToCart}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Save className="h-4 w-4" />
                    Gravar
                  </Button>
                  <Button
                    onClick={orderNow}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Send className="h-4 w-4" />
                    Pedir
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Multicaixa Express Simulation Dialog */}
      <Dialog open={!!mcxDialog?.isOpen} onOpenChange={(open) => !open && setMcxDialog(null)}>
        <DialogContent className="sm:max-w-md text-center p-6">
          <DialogHeader className="items-center">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
              <Smartphone className="h-6 w-6 text-blue-600 animate-pulse" />
            </div>
            <DialogTitle className="text-xl font-extrabold text-slate-900">Pagamento Multicaixa Express</DialogTitle>
            <DialogDescription className="text-slate-500">
              {mcxDialog?.step === "pending" 
                ? "Autorização enviada para o seu telemóvel"
                : mcxDialog?.step === "success" 
                ? "Pagamento confirmado com sucesso!"
                : "Falha na confirmação do pagamento"}
            </DialogDescription>
          </DialogHeader>

          {mcxDialog?.step === "pending" && (
            <div className="space-y-6 py-4">
              <div className="flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  {/* Pulsing ring */}
                  <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping h-20 w-20" />
                  <div className="h-20 w-20 rounded-full border-4 border-t-blue-600 border-r-blue-200 border-b-blue-200 border-l-blue-200 animate-spin flex items-center justify-center">
                    <Smartphone className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <p className="mt-4 font-mono font-bold text-lg tracking-wider text-slate-800">
                  {mcxDialog?.total.toFixed(2)} {store?.currency}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Número MCX: <span className="font-semibold text-slate-700">{mcxDialog?.phone}</span></p>
              </div>

              <div className="bg-slate-50 border rounded-xl p-4 text-left space-y-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Como Confirmar:</p>
                <ol className="text-xs text-slate-600 list-decimal pl-4 space-y-1">
                  <li>Abra o aplicativo <span className="font-semibold text-slate-800">Multicaixa Express</span> no seu telemóvel.</li>
                  <li>Aceda a <span className="font-semibold text-slate-800">Notificações</span> ou <span className="font-semibold text-slate-800">Compras</span>.</li>
                  <li>Autorize o pagamento pendente de <span className="font-semibold text-slate-800">{(mcxDialog?.total || 0).toFixed(2)} {store?.currency}</span>.</li>
                </ol>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button 
                  onClick={() => {
                    const refCode = "MCX-" + Math.floor(Math.random() * 9000000 + 1000000);
                    setMcxDialog(prev => prev ? { ...prev, step: "success", timer: 0 } : null);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 font-bold"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Simular Confirmação
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  A aguardar confirmação da rede EMIS... (Auto-confirma em {mcxDialog?.timer}s)
                </p>
              </div>
            </div>
          )}

          {mcxDialog?.step === "success" && (() => {
            const mockRef = "MCX-" + Math.floor(Math.random() * 9000000 + 1000000);
            return (
              <div className="space-y-6 py-4">
                <div className="flex flex-col items-center justify-center">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3 animate-bounce">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Pagamento Autorizado!</h3>
                  <p className="text-sm text-slate-500 mt-1">Transação processada pela EMIS</p>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs space-y-2 text-left">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor pago:</span>
                    <span className="font-bold text-slate-800">{mcxDialog?.total.toFixed(2)} {store?.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contacto MCX:</span>
                    <span className="font-semibold text-slate-800">{mcxDialog?.phone}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-muted-foreground">Referência:</span>
                    <span className="font-mono font-bold text-blue-600">{mockRef}</span>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    if (mcxDialog) {
                      mcxDialog.onComplete(mockRef);
                    }
                    setMcxDialog(null);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                >
                  <Send className="h-4 w-4" />
                  Concluir e Enviar via WhatsApp
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
