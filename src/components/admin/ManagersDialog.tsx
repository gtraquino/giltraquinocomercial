import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Users, Trash2, Plus } from "lucide-react";

interface Props {
  storeId: string;
  storeName: string;
}

interface Manager {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
}

export default function ManagersDialog({ storeId, storeName }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const qc = useQueryClient();

  const invoke = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("assign-store-manager", {
      body: payload,
    });
    if (error) {
      let msg = error.message;
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
      }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const { data: managers = [], isLoading } = useQuery({
    queryKey: ["store-managers", storeId],
    queryFn: async () => {
      const data = await invoke({ action: "list", store_id: storeId });
      return (data?.managers ?? []) as Manager[];
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (em: string) => invoke({ action: "add", email: em, store_id: storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-managers", storeId] });
      setEmail("");
      toast({ title: "Gestor adicionado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (em: string) => invoke({ action: "remove", email: em, store_id: storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-managers", storeId] });
      toast({ title: "Gestor removido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Users className="h-3 w-3" /> Gestores
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gestores de "{storeName}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2">
            <p className="font-semibold text-foreground">Como criar um gestor</p>
            <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
              <li>
                Peça ao futuro gestor para abrir{" "}
                <a href="/login" target="_blank" rel="noreferrer" className="text-primary underline">/login</a>
                {" "}e clicar em <strong>"Criar conta"</strong> com o email dele.
              </li>
              <li>Ele confirma o email recebido na caixa de entrada.</li>
              <li>Depois, introduza aqui em baixo o mesmo email para o associar a esta loja.</li>
            </ol>
            <p className="text-muted-foreground">
              Por segurança, só o próprio utilizador define a palavra-passe — o admin não a cria por ele.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Associar gestor existente</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email) addMutation.mutate(email); }}
              />
              <Button onClick={() => addMutation.mutate(email)} disabled={!email || addMutation.isPending} className="gap-1">
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <Label className="text-xs text-muted-foreground">Gestores atuais</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground mt-2">A carregar...</p>
            ) : managers.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">Nenhum gestor atribuído.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {managers.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>{m.email}</span>
                    <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(m.email)} disabled={removeMutation.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
