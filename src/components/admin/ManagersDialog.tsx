import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Users, Trash2, Plus, Copy, Check } from "lucide-react";

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
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    mutationFn: (em: string) =>
      invoke({
        action: "add",
        email: em,
        store_id: storeId,
        redirect_to: `${window.location.origin}/reset-password`,
      }),
    onSuccess: (data: any, em) => {
      qc.invalidateQueries({ queryKey: ["store-managers", storeId] });
      setEmail("");
      setLastEmail(em);
      setLastLink(data?.recovery_link ?? null);
      setCopied(false);
      toast({
        title: data?.created ? "Gestor criado" : "Gestor associado",
        description: data?.recovery_link
          ? "Partilhe o link com o gestor para ele definir a palavra-passe."
          : "Gestor associado à loja.",
      });
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

  const copyLink = async () => {
    if (!lastLink) return;
    await navigator.clipboard.writeText(lastLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setLastLink(null); setLastEmail(null); } }}>
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
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Como criar um gestor</p>
            <p className="text-muted-foreground">
              Introduza o email do gestor abaixo. A conta é criada automaticamente (sem confirmação por email)
              e receberá um link para o gestor definir a sua própria palavra-passe.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Email do gestor</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email) addMutation.mutate(email); }}
              />
              <Button onClick={() => addMutation.mutate(email)} disabled={!email || addMutation.isPending} className="gap-1">
                <Plus className="h-4 w-4" /> Criar
              </Button>
            </div>
          </div>

          {lastLink && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-semibold">
                Link para {lastEmail} definir a palavra-passe:
              </p>
              <div className="flex gap-2">
                <Input readOnly value={lastLink} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Envie este link ao gestor (WhatsApp, email, etc.). Ele só precisa de o abrir e definir a palavra-passe.
              </p>
            </div>
          )}

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
