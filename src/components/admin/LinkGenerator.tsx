import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Link2, MessageCircle } from "lucide-react";

export default function LinkGenerator() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", selectedStoreId],
    queryFn: async () => {
      if (!selectedStoreId) return [];
      const { data, error } = await supabase.from("products").select("*").eq("store_id", selectedStoreId).eq("in_stock", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStoreId,
  });

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  const generateLink = () => {
    if (!selectedStore) return "";
    const phone = selectedStore.whatsapp.replace(/[^0-9]/g, "");
    let items = "";
    let total = 0;
    products.forEach((p) => {
      items += `- ${p.name}: ${Number(p.price).toFixed(2)} ${selectedStore.currency}\n`;
      total += Number(p.price);
    });
    const msg = `Olá! Gostaria de fazer um pedido na loja *${selectedStore.name}*.\n\nItens disponíveis:\n${items || "Nenhum item"}\nTotal (aprox): ${total.toFixed(2)} ${selectedStore.currency}\n\nPor favor, informe os itens e quantidades desejados.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const catalogLink = selectedStoreId ? `${window.location.origin}/loja/${selectedStoreId}` : "";
  const whatsappLink = generateLink();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copiado!` });
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Links de Encomenda</h2>

      <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
        <SelectTrigger className="w-full sm:w-[280px]">
          <SelectValue placeholder="Selecione uma loja" />
        </SelectTrigger>
        <SelectContent>
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedStore && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-5 w-5 text-secondary" />
                Link WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Link com mensagem pré-preenchida contendo todos os produtos disponíveis da loja.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={() => copyToClipboard(whatsappLink, "Link WhatsApp")}>
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
                <Button asChild className="gap-2">
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </a>
                </Button>
              </div>
              <div className="mt-2 rounded-md bg-muted p-3">
                <code className="text-xs break-all">{whatsappLink}</code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-5 w-5 text-primary" />
                Catálogo Público
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Página pública onde os clientes podem ver os produtos e fazer encomendas via WhatsApp.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={() => copyToClipboard(catalogLink, "Link do catálogo")}>
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
                <Button asChild className="gap-2">
                  <a href={catalogLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </a>
                </Button>
              </div>
              <div className="mt-2 rounded-md bg-muted p-3">
                <code className="text-xs break-all">{catalogLink}</code>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
