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
import { MessageCircle, Store, ShoppingBag, Send, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

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
    // Abre conversas extra com pequeno atraso para evitar bloqueio de popup
    phones.slice(1).forEach((p, i) => {
      setTimeout(() => openWhatsApp(p, msg), 600 * (i + 1));
    });
  };

  const orderNow = () => {
    if (!selected || !store) return;
    if (!validateCustomer()) return;
    const lineTotal = Number(selected.price) * qty;
    const msg = `Olá! Novo pedido na loja *${store.name}*:\n\n*Cliente:* ${customerName.trim()}\n*Contacto:* ${customerPhone.trim()}\n\n- ${selected.name} x${qty}: ${lineTotal.toFixed(2)} ${store.currency}\n\n*Total: ${lineTotal.toFixed(2)} ${store.currency}*`;
    sendToAllNumbers(msg);
    closeDialog();
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  const sendCartOrder = () => {
    if (!store || cart.length === 0) return;
    if (!validateCustomer()) return;
    let items = "";
    cart.forEach((c) => {
      items += `- ${c.name} x${c.qty}: ${(c.price * c.qty).toFixed(2)} ${store.currency}\n`;
    });
    const msg = `Olá! Novo pedido na loja *${store.name}*:\n\n*Cliente:* ${customerName.trim()}\n*Contacto:* ${customerPhone.trim()}\n\n${items}\n*Total: ${total.toFixed(2)} ${store.currency}*`;
    sendToAllNumbers(msg);
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

  const categories = [...new Set(products.map((p) => p.category || "Outros"))];

  const themeStyle = (store.primary_color || store.accent_color) ? {
    ["--primary" as any]: store.primary_color || undefined,
    ["--accent" as any]: store.accent_color || store.primary_color || undefined,
    ["--ring" as any]: store.primary_color || undefined,
  } as React.CSSProperties : undefined;

  return (
    <div className="min-h-screen bg-background" style={themeStyle}>
      {/* Hero */}
      <div className="bg-primary text-primary-foreground px-4 py-10 md:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-foreground/10 overflow-hidden">
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.name} className="h-full w-full object-cover" />
            ) : (
              <Store className="h-8 w-8" />
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{store.name}</h1>
          <p className="text-primary-foreground/80 capitalize">{store.type} • {store.currency}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-4 md:p-6 pb-32">
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
                            {p.description && <p className="text-sm text-muted-foreground line-clamp-1">{p.description}</p>}
                            <p className="text-sm font-semibold mt-1">{Number(p.price).toFixed(2)} {store.currency}</p>
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
            <div className="mx-auto max-w-4xl flex items-center justify-between gap-3">
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
        )}
      </div>

      {/* Product action dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                {selected.description && (
                  <DialogDescription>{selected.description}</DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-4 py-2">
                {selected.image_url && (
                  <img src={selected.image_url} alt={selected.name} className="w-full h-48 object-cover rounded-lg" />
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
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="text-center"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setQty((q) => q + 1)}
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
