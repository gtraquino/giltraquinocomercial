import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Store, Upload, Sparkles, HardDrive, Camera, CheckCircle2, AlertTriangle, ExternalLink, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { uploadStoreAsset } from "@/lib/imageUpload";
import { extractColorsFromImage } from "@/lib/colorExtract";
import { isStoreBlocked } from "@/lib/billing";
import ManagersDialog from "@/components/admin/ManagersDialog";
import ImageUploader from "@/components/admin/ImageUploader";

interface StoreForm {
  name: string;
  slug?: string;
  type: "comercial" | "restaurante";
  currency: "Kz" | "USD";
  whatsapp: string;
  whatsapp_2: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
}

function slugify(text: string): string {
  const base = text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "loja";
}

const emptyForm: StoreForm = {
  name: "", slug: "", type: "comercial", currency: "Kz", whatsapp: "", whatsapp_2: "",
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
      const rawSlug = data.slug?.trim() || slugify(data.name);
      let storeSlug = slugify(rawSlug);

      let candidateSlug = storeSlug;
      let counter = 1;
      while (stores.some((s: any) => s.slug === candidateSlug && s.id !== data.id)) {
        candidateSlug = `${storeSlug}-${counter++}`;
      }
      storeSlug = candidateSlug;

      const payloadWithSlug: any = {
        name: data.name,
        slug: storeSlug,
        type: data.type,
        currency: data.currency,
        whatsapp: data.whatsapp,
        whatsapp_2: data.whatsapp_2 || null,
        logo_url: data.logo_url || null,
        primary_color: data.primary_color || null,
        accent_color: data.accent_color || null,
      };

      const payloadWithoutSlug: any = {
        name: data.name,
        type: data.type,
        currency: data.currency,
        whatsapp: data.whatsapp,
        whatsapp_2: data.whatsapp_2 || null,
        logo_url: data.logo_url || null,
        primary_color: data.primary_color || null,
        accent_color: data.accent_color || null,
      };

      if (data.id) {
        let res = await supabase.from("stores").update(payloadWithSlug).eq("id", data.id);
        if (res.error && res.error.message?.includes("slug")) {
          res = await supabase.from("stores").update(payloadWithoutSlug).eq("id", data.id);
        }
        if (res.error) throw res.error;
      } else {
        let res = await supabase.from("stores").insert({ ...payloadWithSlug, created_by: user!.id });
        if (res.error && res.error.message?.includes("slug")) {
          res = await supabase.from("stores").insert({ ...payloadWithoutSlug, created_by: user!.id });
        }
        if (res.error) throw res.error;
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

  const updateLogoMutation = useMutation({
    mutationFn: async ({ storeId, logoUrl }: { storeId: string; logoUrl: string }) => {
      let primaryColor: string | undefined;
      let accentColor: string | undefined;
      if (logoUrl) {
        const colors = await extractColorsFromImage(logoUrl);
        if (colors) {
          primaryColor = colors.primary;
          accentColor = colors.accent;
        }
      }
      const payload: any = { logo_url: logoUrl || null };
      if (primaryColor) payload.primary_color = primaryColor;
      if (accentColor) payload.accent_color = accentColor;
      const { error } = await supabase.from("stores").update(payload).eq("id", storeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast({ title: "Logótipo atualizado", description: "O logótipo da loja foi guardado com sucesso." });
    },
    onError: (e: Error) => toast({ title: "Erro ao atualizar logótipo", description: e.message, variant: "destructive" }),
  });

  const handleLogoChange = async (url: string) => {
    setForm((f) => ({ ...f, logo_url: url }));
    if (url) {
      try {
        const colors = await extractColorsFromImage(url);
        if (colors) {
          setForm((f) => ({
            ...f,
            logo_url: url,
            primary_color: colors.primary || f.primary_color,
            accent_color: colors.accent || f.accent_color,
          }));
          toast({
            title: "Logótipo processado",
            description: "Cores da loja extraídas automaticamente.",
          });
        }
      } catch {
        // Safe fallback
      }
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
      slug: (store as any).slug || slugify(store.name),
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestão de Lojas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie lojas e carregue no botão <strong className="text-foreground">"Link do Gestor"</strong> para gerar o link de acesso aos gestores com mensalidade em dia.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Nova Loja
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Loja" : "Nova Loja"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da loja</Label>
                <Input
                  placeholder="Nome da loja"
                  value={form.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name: newName,
                      slug: !editId && (!f.slug || f.slug === slugify(f.name)) ? slugify(newName) : f.slug,
                    }));
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Identificador / Link amigável (slug)</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-2 rounded-md border">/loja/</span>
                  <Input
                    placeholder="minha-loja"
                    value={form.slug || ""}
                    onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo de loja</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as StoreForm["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="restaurante">Restaurante</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as StoreForm["currency"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kz">Kz (Kwanza)</SelectItem>
                    <SelectItem value="USD">USD (Dólar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>WhatsApp principal (recebe pedidos)</Label>
                <Input placeholder="Ex: 244923456789" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp secundário (opcional, também recebe)</Label>
                <Input placeholder="Ex: 244987654321" value={form.whatsapp_2} onChange={(e) => setForm({ ...form, whatsapp_2: e.target.value })} />
              </div>

              {/* Logo upload */}
              <ImageUploader
                label="Logótipo da loja (escolher do disco rígido)"
                description="Carregue o logótipo a partir do seu computador. As cores da marca serão extraídas automaticamente."
                value={form.logo_url}
                onChange={handleLogoChange}
                folder="logos"
                storeId={editId || undefined}
              />

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
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>Moeda: <strong className="text-foreground">{store.currency}</strong></span>
                    <span>WhatsApp: <strong className="text-foreground">{store.whatsapp}</strong></span>
                  </div>

                  {isStoreBlocked(store) ? (
                    <Badge variant="destructive" className="gap-1 text-[11px] font-semibold">
                      <AlertTriangle className="h-3 w-3" /> Mensalidade em atraso
                    </Badge>
                  ) : store.paid_until ? (
                    <Badge variant="secondary" className="gap-1 text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3" /> Em dia ({store.paid_until})
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3" /> Mensalidade em dia
                    </Badge>
                  )}
                </div>

                {!store.logo_url ? (
                  <div className="pt-1">
                    <label className="cursor-pointer block">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          toast({ title: "A carregar do disco duro...", description: file.name });
                          try {
                            const url = await uploadStoreAsset(file, "logos", store.id);
                            updateLogoMutation.mutate({ storeId: store.id, logoUrl: url });
                          } catch (err) {
                            toast({ title: "Erro ao ler ficheiro", description: (err as Error).message, variant: "destructive" });
                          }
                        }}
                      />
                      <div className="w-full flex items-center justify-center gap-2 py-2.5 px-3 border border-dashed rounded-lg bg-primary/5 border-primary/30 hover:bg-primary/10 text-xs font-semibold text-primary transition-all">
                        <HardDrive className="h-4 w-4" />
                        <span>Escolher Imagem / Logótipo no Disco Duro</span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                    <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Logótipo configurado
                    </span>
                    <label className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          toast({ title: "A carregar nova imagem do disco...", description: file.name });
                          try {
                            const url = await uploadStoreAsset(file, "logos", store.id);
                            updateLogoMutation.mutate({ storeId: store.id, logoUrl: url });
                          } catch (err) {
                            toast({ title: "Erro ao ler ficheiro", description: (err as Error).message, variant: "destructive" });
                          }
                        }}
                      />
                      <Camera className="h-3.5 w-3.5" /> Trocar imagem do disco
                    </label>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                  <ManagersDialog storeId={store.id} storeName={store.name} store={store} />
                  
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => openEdit(store)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <a href={`/loja/${(store as { slug?: string }).slug || store.id}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3" /> Catálogo
                    </a>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 ml-auto"
                    title="Remover loja"
                    onClick={() => deleteMutation.mutate(store.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
