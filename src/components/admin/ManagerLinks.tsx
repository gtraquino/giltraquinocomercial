import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Link2 } from "lucide-react";

export default function ManagerLinks() {
  const { user } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const { data: stores = [] } = useQuery({
    queryKey: ["manager-stores", user?.id],
    queryFn: async () => {
      const { data: mgr, error: mgrErr } = await supabase
        .from("store_managers").select("store_id").eq("user_id", user!.id);
      if (mgrErr) throw mgrErr;
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
    if (stores && stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const catalogLink = selectedStoreId ? `${window.location.origin}/loja/${selectedStoreId}` : "";

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: "Link copiado!" }));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Link da Loja</h2>

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-5 w-5 text-primary" />
              Catálogo Público
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Partilhe este link com os seus clientes. Eles poderão ver os produtos e enviar pedidos via WhatsApp.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="gap-2" onClick={() => copy(catalogLink)}>
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
      )}
    </div>
  );
}
