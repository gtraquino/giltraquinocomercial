import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Store, ShoppingBag } from "lucide-react";
import { useState } from "react";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export default function PublicStore() {
  const { storeId } = useParams<{ storeId: string }>();
  const [cart, setCart] = useState<CartItem[]>([]);

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

  const addToCart = (product: typeof products[0]) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === product.id);
      if (existing) {
        return prev.map((c) => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { id: product.id, name: product.name, price: Number(product.price), qty: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) return removeFromCart(id);
    setCart((prev) => prev.map((c) => c.id === id ? { ...c, qty } : c));
  };

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  const sendOrder = () => {
    if (!store || cart.length === 0) return;
    const phone = store.whatsapp.replace(/[^0-9]/g, "");
    let items = "";
    cart.forEach((c) => {
      items += `- ${c.name} x${c.qty}: ${(c.price * c.qty).toFixed(2)} ${store.currency}\n`;
    });
    const msg = `Olá! Gostaria de fazer um pedido na loja *${store.name}*:\n\n${items}\n*Total: ${total.toFixed(2)} ${store.currency}*`;
    const link = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(link, "_blank");
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

  // Group by category
  const categories = [...new Set(products.map((p) => p.category || "Outros"))];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground px-4 py-10 md:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/10">
            <Store className="h-8 w-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{store.name}</h1>
          <p className="text-primary-foreground/80 capitalize">{store.type} • {store.currency}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-4 md:p-6">
        {/* Products */}
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
                      <Card key={p.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-medium truncate">{p.name}</h3>
                            {p.description && <p className="text-sm text-muted-foreground line-clamp-1">{p.description}</p>}
                            <p className="text-sm font-semibold mt-1">{Number(p.price).toFixed(2)} {store.currency}</p>
                          </div>
                          {inCart ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQty(p.id, inCart.qty - 1)}>−</Button>
                              <span className="w-6 text-center text-sm font-medium">{inCart.qty}</span>
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQty(p.id, inCart.qty + 1)}>+</Button>
                            </div>
                          ) : (
                            <Button size="sm" onClick={() => addToCart(p)} className="shrink-0">Adicionar</Button>
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
          <div className="fixed bottom-0 inset-x-0 bg-card border-t shadow-lg p-4 z-50">
            <div className="mx-auto max-w-4xl flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{cart.reduce((s, c) => s + c.qty, 0)} itens</p>
                <p className="text-lg font-bold">{total.toFixed(2)} {store.currency}</p>
              </div>
              <Button onClick={sendOrder} size="lg" className="gap-2">
                <MessageCircle className="h-5 w-5" />
                Encomendar via WhatsApp
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
