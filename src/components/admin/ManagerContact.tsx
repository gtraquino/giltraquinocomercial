import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Phone } from "lucide-react";

export default function ManagerContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsapp2, setWhatsapp2] = useState("");
  const [nif, setNif] = useState("");
  const [address, setAddress] = useState("");

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

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  useEffect(() => {
    if (selectedStore) {
      setWhatsapp(selectedStore.whatsapp || "");
      setWhatsapp2(selectedStore.whatsapp_2 || "");
      setNif((selectedStore as any).nif || "");
      setAddress((selectedStore as any).address || "");
    }
  }, [selectedStore]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStoreId) return;
      const { error } = await supabase
        .from("stores")
        .update({ whatsapp, whatsapp_2: whatsapp2 || null, nif: nif || null, address: address || null } as any)
        .eq("id", selectedStoreId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-stores"] });
      toast({ title: "Dados da loja atualizados" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Contactos para Pedidos</h2>

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

      {selectedStore ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>WhatsApp principal</Label>
              <Input
                placeholder="+244 900 000 000"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Inclua o código do país. Receberá os pedidos aqui.</p>
            </div>
            <div className="space-y-2">
              <Label>WhatsApp secundário (opcional)</Label>
              <Input
                placeholder="+244 900 000 000"
                value={whatsapp2}
                onChange={(e) => setWhatsapp2(e.target.value)}
              />
            </div>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !whatsapp.trim()}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              {saveMutation.isPending ? "A guardar..." : "Guardar contactos"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Phone className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Selecione uma loja para definir os contactos.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
