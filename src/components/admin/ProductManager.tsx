import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { uploadStoreAsset } from "@/lib/imageUpload";
import { ImageIcon, Upload } from "lucide-react";
import { parseProductDescription, formatProductDescription } from "@/utils/stock";

interface ProductForm {
  name: string;
  description: string;
  price: string;
  category: string;
  in_stock: boolean;
  image_url: string;
  stock_qty: string;
  stock_unlimited: boolean;
}

const emptyForm: ProductForm = { 
  name: "", 
  description: "", 
  price: "", 
  category: "", 
  in_stock: true, 
  image_url: "",
  stock_qty: "",
  stock_unlimited: true
};

export default function ProductManager() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores-scoped", isAdmin, user?.id],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.from("stores").select("*").order("name");
        if (error) throw error;
        return data;
      }
      const { data: mgr, error: mgrErr } = await supabase
        .from("store_managers").select("store_id").eq("user_id", user!.id);
      if (mgrErr) throw mgrErr;
      const ids = (mgr ?? []).map((m) => m.store_id);
      if (ids.length === 0) return [];
      const { data, error = null } = await supabase.from("stores").select("*").in("id", ids).order("name");
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

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", selectedStoreId],
    queryFn: async () => {
      if (!selectedStoreId) return [];
      const { data, error } = await supabase.from("products").select("*").eq("store_id", selectedStoreId).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStoreId,
  });

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  const upsertMutation = useMutation({
    mutationFn: async (data: ProductForm & { id?: string }) => {
      const parsedQty = data.stock_unlimited ? null : parseInt(data.stock_qty || "0", 10);
      const combinedDescription = formatProductDescription(data.description, parsedQty);
      
      // If limited stock and quantity is 0 or less, auto-set in_stock = false
      const calculatedInStock = data.stock_unlimited ? data.in_stock : (parsedQty !== null && parsedQty > 0 ? data.in_stock : false);

      const payload = {
        name: data.name,
        description: combinedDescription || null,
        price: parseFloat(data.price),
        category: data.category || null,
        in_stock: calculatedInStock,
        image_url: data.image_url || null,
        store_id: selectedStoreId,
      };
      if (data.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", selectedStoreId] });
      setForm(emptyForm);
      setEditId(null);
      setDialogOpen(false);
      toast({ title: editId ? "Produto atualizado" : "Produto adicionado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", selectedStoreId] });
      toast({ title: "Produto removido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    upsertMutation.mutate({ ...form, id: editId ?? undefined });
  };

  const openEdit = (product: typeof products[0]) => {
    const { cleanDescription, stockQty } = parseProductDescription(product.description);
    setForm({
      name: product.name,
      description: cleanDescription,
      price: String(product.price),
      category: product.category || "",
      in_stock: product.in_stock,
      image_url: product.image_url || "",
      stock_qty: stockQty !== null ? String(stockQty) : "",
      stock_unlimited: stockQty === null,
    });
    setEditId(product.id);
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máx. 5MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadStoreAsset(file, "products");
      setForm((f) => ({ ...f, image_url: url }));
      toast({ title: "Imagem carregada" });
    } catch (err) {
      toast({ title: "Erro no upload", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Produtos</h2>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Selecione uma loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedStoreId && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setForm(emptyForm); setEditId(null); }} className="gap-2 shrink-0">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </DialogTrigger>              <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                  <DialogTitle>{editId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
                  <div className="space-y-1">
                    <Label htmlFor="product-name">Nome do produto</Label>
                    <Input id="product-name" placeholder="Nome do produto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="product-desc">Descrição (opcional)</Label>
                    <Textarea id="product-desc" placeholder="Descrição do produto" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="product-price">Preço ({selectedStore?.currency || ""})</Label>
                      <Input id="product-price" type="number" step="0.01" min="0" placeholder="0.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="product-cat">Categoria</Label>
                      <Input id="product-cat" placeholder="Ex: Bebidas" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                    </div>
                  </div>

                  {/* Stock Management Fields */}
                  <div className="space-y-2.5 border-t pt-3.5">
                    <Label className="font-semibold text-xs text-slate-700 uppercase tracking-wider">Gestão de Inventário / Stock</Label>
                    <div className="flex items-center gap-5 py-1">
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input 
                          type="radio" 
                          name="stock_unlimited" 
                          checked={form.stock_unlimited} 
                          onChange={() => setForm({ ...form, stock_unlimited: true, stock_qty: "" })}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span>Ilimitado (Sempre disponível)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input 
                          type="radio" 
                          name="stock_unlimited" 
                          checked={!form.stock_unlimited} 
                          onChange={() => setForm({ ...form, stock_unlimited: false })}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span>Limitado</span>
                      </label>
                    </div>
                    {!form.stock_unlimited && (
                      <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                        <Label htmlFor="product-stock-qty" className="text-xs font-medium text-slate-600">Quantidade em Stock</Label>
                        <Input 
                          id="product-stock-qty"
                          type="number" 
                          min="0" 
                          placeholder="Ex: 25" 
                          value={form.stock_qty} 
                          onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                          required={!form.stock_unlimited}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Imagem do produto</Label>
                    <div className="flex items-center gap-3">
                      {form.image_url ? (
                        <img src={form.image_url} alt="Produto" className="h-16 w-16 rounded-lg object-cover border" />
                      ) : (
                        <div className="h-16 w-16 rounded-lg border border-dashed flex items-center justify-center bg-muted">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="flex-1" />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t pt-3">
                    <Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} />
                    <Label className="cursor-pointer">Ativo / Disponível para venda</Label>
                  </div>
                  <Button type="submit" className="w-full" disabled={upsertMutation.isPending || uploading}>
                    {uploading ? <><Upload className="h-4 w-4 mr-2 animate-pulse" /> A carregar...</> : upsertMutation.isPending ? "A guardar..." : editId ? "Atualizar" : "Adicionar Produto"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {!selectedStoreId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Selecione uma loja para gerir os produtos.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded" />)}
        </div>
      ) : products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum produto nesta loja.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const { stockQty } = parseProductDescription(p.description);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{Number(p.price).toFixed(2)} {selectedStore?.currency}</TableCell>
                    <TableCell>{p.category || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium w-fit ${p.in_stock ? "bg-secondary/20 text-secondary" : "bg-destructive/20 text-destructive"}`}>
                          {p.in_stock ? "Disponível" : "Esgotado"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {stockQty !== null ? `Qtd: ${stockQty}` : "Ilimitado"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
