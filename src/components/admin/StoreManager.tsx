import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Store, Upload, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { uploadStoreAsset } from "@/lib/imageUpload";
import { extractColorsFromImage } from "@/lib/colorExtract";

interface StoreForm {
  name: string;
  type: "comercial" | "restaurante";
  currency: "Kz" | "USD";
  whatsapp: string;
  whatsapp_2: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
}

const emptyForm: StoreForm = {
  name: "", type: "comercial", currency: "Kz", whatsapp: "", whatsapp_2: "",
  logo_url: "", primary_color: "", accent_color: "",
};

export default function StoreManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StoreForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: StoreForm & { id?: string }) => {
      const payload = {
        name: data.name, type: data.type, currency: data.currency, whatsapp: data.whatsapp,
        whatsapp_2: data.whatsapp_2 || null,
        logo_url: data.logo_url || null,
        primary_color: data.primary_color || null,
        accent_color: data.accent_color || null,
      };
      if (data.id) {
        const { error } = await supabase.from("stores").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stores").insert({ ...payload, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      setForm(emptyForm);
      setEditId(null);
      setDialogOpen(false);
      toast({ title: editId ? "Loja atualizada" : "Loja criada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast({ title: "Loja removida" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máx. 5MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadStoreAsset(file, "logos");
      const colors = await extractColorsFromImage(url);
      setForm((f) => ({
        ...f,
        logo_url: url,
        primary_color: colors?.primary || f.primary_color,
        accent_color: colors?.accent || f.accent_color,
      }));
      toast({
        title: "Logótipo carregado",
        description: colors ? "Cores extraídas automaticamente" : "Cores não puderam ser extraídas",
      });
    } catch (err) {
      toast({ title: "Erro no upload", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const reExtractColors = async () => {
    if (!form.logo_url) return;
    setUploading(true);
    const colors = await extractColorsFromImage(form.logo_url);
    setUploading(false);
    if (colors) {
      setForm((f) => ({ ...f, primary_color: colors.primary, accent_color: colors.accent }));
      toast({ title: "Cores atualizadas" });
    } else {
      toast({ title: "Não foi possível extrair cores", variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertMutation.mutate({ ...form, id: editId ?? undefined });
  };

  const openEdit = (store: typeof stores[0]) => {
    setForm({
      name: store.name,
      type: store.type as "comercial" | "restaurante",
      currency: store.currency as "Kz" | "USD",
      whatsapp: store.whatsapp,
      whatsapp_2: (store as any).whatsapp_2 || "",
      logo_url: store.logo_url || "",
      primary_color: store.primary_color || "",
      accent_color: store.accent_color || "",
    });
    setEditId(store.id);
    setDialogOpen(true);
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditId(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Lojas</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Loja
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Loja" : "Nova Loja"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Nome da loja" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as StoreForm["type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="restaurante">Restaurante</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as StoreForm["currency"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kz">Kz (Kwanza)</SelectItem>
                  <SelectItem value="USD">USD (Dólar)</SelectItem>
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <Label>WhatsApp principal (recebe pedidos)</Label>
                <Input placeholder="Ex: 244923456789" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp secundário (opcional, também recebe)</Label>
                <Input placeholder="Ex: 244987654321" value={form.whatsapp_2} onChange={(e) => setForm({ ...form, whatsapp_2: e.target.value })} />
              </div>

              {/* Logo upload */}
              <div className="space-y-2">
                <Label>Logótipo da loja</Label>
                <div className="flex items-center gap-3">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="Logótipo" className="h-16 w-16 rounded-lg object-cover border" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg border border-dashed flex items-center justify-center bg-muted">
                      <Store className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} />
                    <p className="text-xs text-muted-foreground mt-1">As cores serão extraídas automaticamente</p>
                  </div>
                </div>
              </div>

              {/* Color preview */}
              {(form.primary_color || form.accent_color) && (
                <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Cores extraídas</Label>
                    {form.logo_url && (
                      <Button type="button" variant="ghost" size="sm" onClick={reExtractColors} disabled={uploading} className="h-7 gap-1 text-xs">
                        <Sparkles className="h-3 w-3" /> Re-extrair
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {form.primary_color && (
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded border" style={{ background: `hsl(${form.primary_color})` }} />
                        <span className="text-xs text-muted-foreground">Primária</span>
                      </div>
                    )}
                    {form.accent_color && (
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded border" style={{ background: `hsl(${form.accent_color})` }} />
                        <span className="text-xs text-muted-foreground">Destaque</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={upsertMutation.isPending || uploading}>
                {uploading ? <><Upload className="h-4 w-4 mr-2 animate-pulse" /> A carregar imagem...</> : upsertMutation.isPending ? "A guardar..." : editId ? "Atualizar" : "Criar Loja"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-5 bg-muted rounded w-3/4" /></CardHeader>
              <CardContent><div className="h-4 bg-muted rounded w-1/2" /></CardContent>
            </Card>
          ))}
        </div>
      ) : stores.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma loja criada ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => (
            <Card key={store.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {store.logo_url ? (
                      <img src={store.logo_url} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                    ) : (
                      <Store className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{store.name}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {store.type}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Moeda: <strong className="text-foreground">{store.currency}</strong></span>
                  <span>WhatsApp: <strong className="text-foreground">{store.whatsapp}</strong></span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(store)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => deleteMutation.mutate(store.id)}
                  >
                    <Trash2 className="h-3 w-3" /> Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
