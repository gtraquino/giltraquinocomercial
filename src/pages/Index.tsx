import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, ArrowRight, ShieldCheck, MessageCircle, Zap } from "lucide-react";

export default function Index() {
  const { data: stores = [] } = useQuery({
    queryKey: ["public-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 text-center relative z-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Store className="h-8 w-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Encomendas via WhatsApp
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-8">
            Crie a sua loja online, adicione produtos e receba encomendas diretamente no WhatsApp. Simples, rápido e sem complicações.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" variant="secondary" className="gap-2 text-base">
              <Link to="/login">
                Começar Agora <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(217_71%_45%/0.3),transparent_60%)]" />
      </header>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: <Zap className="h-6 w-6" />, title: "Rápido de configurar", desc: "Crie a sua loja e adicione produtos em minutos." },
            { icon: <MessageCircle className="h-6 w-6" />, title: "Encomendas no WhatsApp", desc: "Os clientes escolhem os produtos e enviam o pedido diretamente pelo WhatsApp." },
            { icon: <ShieldCheck className="h-6 w-6" />, title: "Painel seguro", desc: "Gerencie lojas e produtos com autenticação segura." },
          ].map((f, i) => (
            <Card key={i} className="text-center border-0 shadow-none bg-transparent">
              <CardContent className="pt-6">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Public stores */}
      {stores.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">Lojas Disponíveis</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store) => (
              <Card key={store.id} className="group hover:shadow-lg transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-primary" />
                    {store.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground capitalize mb-3">{store.type} • {store.currency}</p>
                  <Button asChild variant="outline" size="sm" className="gap-2">
                    <Link to={`/loja/${store.id}`}>
                      Ver Catálogo <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Encomendas WhatsApp. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
