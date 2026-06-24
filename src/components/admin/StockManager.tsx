import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { parseProductDescription, formatProductDescription } from "@/utils/stock";
import { 
  Plus, 
  Minus, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Infinity as InfinityIcon, 
  Filter, 
  Package, 
  RefreshCw 
} from "lucide-react";

type StockFilter = "all" | "out_of_stock" | "low_stock" | "available" | "unlimited";

export default function StockManager() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StockFilter>("all");

  // Query stores managed by the current user
  const { data: stores = [] } = useQuery({
    queryKey: ["stores-scoped-stock", isAdmin, user?.id],
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

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  // Auto-select first store
  useEffect(() => {
    if (stores && stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  // Query products for current store
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products-for-stock-manager", selectedStoreId],
    queryFn: async () => {
      if (!selectedStoreId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", selectedStoreId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStoreId,
  });

  // Extract unique categories for filter
  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category || "Outros").filter(Boolean)))];

  // Update product stock mutation
  const updateStockMutation = useMutation({
    mutationFn: async ({ 
      productId, 
      cleanDescription, 
      newQty, 
      inStock 
    }: { 
      productId: string; 
      productName: string;
      oldQty: number | null;
      cleanDescription: string; 
      newQty: number | null; 
      inStock: boolean 
    }) => {
      const combinedDescription = formatProductDescription(cleanDescription, newQty);
      const { error } = await supabase
        .from("products")
        .update({
          description: combinedDescription || null,
          in_stock: inStock
        })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products-for-stock-manager", selectedStoreId] });
      queryClient.invalidateQueries({ queryKey: ["products", selectedStoreId] });

      const { productName, oldQty, newQty, inStock } = variables;

      if (newQty !== null) {
        if (oldQty !== null) {
          if (newQty > oldQty) {
            toast({
              title: "📥 Entrada de Stock Registada",
              description: `Foram adicionadas +${newQty - oldQty} unidades para "${productName}". Novo stock: ${newQty} un.`,
            });
          } else if (newQty < oldQty) {
            toast({
              title: "📤 Saída de Stock Registada",
              description: `Foram retiradas -${oldQty - newQty} unidades de "${productName}". Restam: ${newQty} un.`,
            });

            // Warn about low stock
            if (newQty <= 5 && newQty > 0) {
              toast({
                title: "⚠️ Alerta: Stock Mínimo!",
                description: `O produto "${productName}" atingiu o limite mínimo de segurança (restam apenas ${newQty} un.).`,
                variant: "destructive",
              });
            } else if (newQty === 0) {
              toast({
                title: "🚨 Alerta: Produto Esgotado!",
                description: `O produto "${productName}" está agora totalmente sem stock.`,
                variant: "destructive",
              });
            }
          } else {
            // No qty change but maybe toggled inStock
            toast({
              title: inStock ? "🟢 Produto Ativo" : "🔴 Produto Inativo",
              description: `O produto "${productName}" está agora ${inStock ? "ativo para venda" : "inativo/oculto na loja"}.`,
            });
          }
        } else {
          // Transitioned from unlimited to limited
          toast({
            title: "⚙️ Stock Limitado Configurado",
            description: `O produto "${productName}" foi alterado de stock ilimitado para stock de ${newQty} un.`,
          });
        }
      } else {
        if (oldQty !== null) {
          // Transitioned to unlimited
          toast({
            title: "⚙️ Stock Ilimitado Configurado",
            description: `O produto "${productName}" agora tem stock ilimitado (sempre disponível).`,
          });
        } else {
          // Just toggled inStock while unlimited
          toast({
            title: inStock ? "🟢 Produto Ativo" : "🔴 Produto Inativo",
            description: `O produto "${productName}" está agora ${inStock ? "ativo para venda" : "inativo/oculto na loja"}.`,
          });
        }
      }
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao atualizar stock",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const handleQtyChange = (product: typeof products[0], newQty: number | null) => {
    const { cleanDescription, stockQty } = parseProductDescription(product.description);
    
    // Automatically set out of stock if quantity is 0
    let calculatedInStock = product.in_stock;
    if (newQty !== null) {
      if (newQty <= 0) {
        calculatedInStock = false;
      } else {
        calculatedInStock = true;
      }
    }

    updateStockMutation.mutate({
      productId: product.id,
      productName: product.name,
      oldQty: stockQty,
      cleanDescription,
      newQty,
      inStock: calculatedInStock
    });
  };

  const handleToggleUnlimited = (product: typeof products[0], currentlyUnlimited: boolean) => {
    const { cleanDescription, stockQty } = parseProductDescription(product.description);
    
    const newQty = currentlyUnlimited ? 10 : null; // default to 10 if switching to limited
    const calculatedInStock = true; // both are in stock initially

    updateStockMutation.mutate({
      productId: product.id,
      productName: product.name,
      oldQty: stockQty,
      cleanDescription,
      newQty,
      inStock: calculatedInStock
    });
  };

  const handleToggleInStock = (product: typeof products[0], newInStock: boolean) => {
    const { cleanDescription, stockQty } = parseProductDescription(product.description);
    
    // If turning on, but stock is limited and 0, reset stock to 5 or keep unlimited
    let correctedQty = stockQty;
    if (newInStock && stockQty !== null && stockQty <= 0) {
      correctedQty = 5;
    }

    updateStockMutation.mutate({
      productId: product.id,
      productName: product.name,
      oldQty: stockQty,
      cleanDescription,
      newQty: correctedQty,
      inStock: newInStock
    });
  };

  // Filter products based on search, category and status
  const parsedProducts = products.map((p) => {
    const { cleanDescription, stockQty } = parseProductDescription(p.description);
    
    // Determine status
    let status: "unlimited" | "available" | "low_stock" | "out_of_stock" = "unlimited";
    if (stockQty !== null) {
      if (stockQty === 0 || !p.in_stock) {
        status = "out_of_stock";
      } else if (stockQty <= 5) {
        status = "low_stock";
      } else {
        status = "available";
      }
    } else {
      status = p.in_stock ? "unlimited" : "out_of_stock";
    }

    return {
      ...p,
      cleanDescription,
      stockQty,
      status
    };
  });

  const filteredProducts = parsedProducts.filter((p) => {
    // Search filter
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Category filter
    const matchesCategory = selectedCategory === "all" || (p.category || "Outros") === selectedCategory;

    // Status filter
    let matchesStatus = true;
    if (statusFilter === "out_of_stock") {
      matchesStatus = p.status === "out_of_stock";
    } else if (statusFilter === "low_stock") {
      matchesStatus = p.status === "low_stock";
    } else if (statusFilter === "available") {
      matchesStatus = p.status === "available";
    } else if (statusFilter === "unlimited") {
      matchesStatus = p.status === "unlimited";
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Calculate high-level metrics
  const totalItems = parsedProducts.length;
  const outOfStockCount = parsedProducts.filter((p) => p.status === "out_of_stock").length;
  const lowStockCount = parsedProducts.filter((p) => p.status === "low_stock").length;
  const unlimitedCount = parsedProducts.filter((p) => p.status === "unlimited").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestão de Inventário / Stock</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Controle e atualize as quantidades em stock de forma rápida e eficiente.
          </p>
        </div>
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
        </div>
      </div>

      {selectedStoreId && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className="text-sm font-medium text-slate-500">Total Produtos</p>
                  <Package className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{totalItems}</span>
                  <span className="text-xs text-slate-400">ativos no catálogo</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-l-4 border-l-red-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className="text-sm font-medium text-red-500">Esgotados</p>
                  <XCircle className="h-4 w-4 text-red-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-red-700">{outOfStockCount}</span>
                  <span className="text-xs text-red-400">precisam de reposição</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-l-4 border-l-amber-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className="text-sm font-medium text-amber-600">Stock Baixo</p>
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-700">{lowStockCount}</span>
                  <span className="text-xs text-amber-400">menor ou igual a 5 un.</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-l-4 border-l-slate-400">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className="text-sm font-medium text-slate-500">Stock Ilimitado</p>
                  <InfinityIcon className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-700">{unlimitedCount}</span>
                  <span className="text-xs text-slate-400">sempre disponíveis</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerts Panel */}
          {parsedProducts.filter((p) => p.status === "low_stock" || p.status === "out_of_stock").length > 0 && (
            <Card className="border-l-4 border-l-amber-500 bg-amber-50/10 shadow-xs">
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-sm font-bold text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Alertas de Ruptura ou Stock Mínimo ({parsedProducts.filter((p) => p.status === "low_stock" || p.status === "out_of_stock").length})
                </CardTitle>
                <CardDescription className="text-xs text-amber-700">
                  Os seguintes produtos encontram-se esgotados ou com stock abaixo do nível mínimo de segurança recomendado (≤ 5 un.). Dê entrada rápida de stock usando os botões de ajuste de unidades.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {parsedProducts
                    .filter((p) => p.status === "low_stock" || p.status === "out_of_stock")
                    .slice(0, 6)
                    .map((p) => (
                      <div key={p.id} className="bg-white p-3 rounded-lg border border-amber-100 flex items-center justify-between gap-3 shadow-2xs hover:border-amber-200 transition-all">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-slate-800 truncate" title={p.name}>
                            {p.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {p.status === "out_of_stock" ? (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-sm">Esgotado</span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-sm">Baixo: {p.stockQty} un.</span>
                            )}
                            <span className="text-[10px] text-slate-400 font-medium truncate">({p.category || "Outros"})</span>
                          </div>
                        </div>
                        
                        {/* Quick Stock Addition actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="xs"
                            variant="outline"
                            className="h-7 px-2 text-[10px] border-amber-200 text-amber-800 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-1 font-semibold"
                            onClick={() => {
                              const oldVal = p.stockQty || 0;
                              handleQtyChange(p, oldVal + 10);
                            }}
                          >
                            +10 Un.
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            className="h-7 px-2 text-[10px] border-amber-200 text-amber-800 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-1 font-semibold"
                            onClick={() => {
                              const oldVal = p.stockQty || 0;
                              handleQtyChange(p, oldVal + 20);
                            }}
                          >
                            +20 Un.
                          </Button>
                        </div>
                      </div>
                    ))}
                  {parsedProducts.filter((p) => p.status === "low_stock" || p.status === "out_of_stock").length > 6 && (
                    <div className="col-span-full text-center text-[11px] text-slate-500 font-medium pt-1">
                      E mais {parsedProducts.filter((p) => p.status === "low_stock" || p.status === "out_of_stock").length - 6} produtos com alertas. Use os filtros de stock na tabela abaixo para ver a lista completa.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Pesquise por nome ou categoria..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>

            {/* Category Filter */}
            <div className="w-full md:w-[180px]">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat === "all" ? "Todas Categorias" : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-[180px]">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StockFilter)}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Estado de Stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Estados</SelectItem>
                  <SelectItem value="available">Em Stock / Normal</SelectItem>
                  <SelectItem value="low_stock">Stock Baixo (≤ 5)</SelectItem>
                  <SelectItem value="out_of_stock">Esgotados / Sem Stock</SelectItem>
                  <SelectItem value="unlimited">Ilimitados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Products Table */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-lg font-bold">Catálogo de Artigos</CardTitle>
                <CardDescription>
                  Clique nos botões de ajuste rápido ou alterne para ilimitado com um clique.
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["products-for-stock-manager", selectedStoreId] })}
              >
                <RefreshCw className="h-4 w-4 text-slate-500" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {productsLoading ? (
                <div className="p-8 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <Package className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                  <p className="text-slate-600 font-semibold text-sm">Nenhum produto encontrado</p>
                  <p className="text-slate-400 text-xs mt-1">Tente ajustar os seus filtros de pesquisa ou categoria.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/70">
                      <TableRow>
                        <TableHead className="w-[100px] pl-6">Foto</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="w-[180px] text-center">Quantidade</TableHead>
                        <TableHead className="w-[120px] text-center">Ilimitado</TableHead>
                        <TableHead className="w-[140px] text-right pr-6">Ativo p/ Venda</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((p) => (
                        <TableRow key={p.id} className="hover:bg-slate-50/50">
                          {/* Image */}
                          <TableCell className="pl-6">
                            {p.image_url ? (
                              <img 
                                src={p.image_url} 
                                alt={p.name} 
                                className="w-12 h-12 rounded-lg object-cover border border-slate-100 shadow-xs"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                                <Package className="h-5 w-5" />
                              </div>
                            )}
                          </TableCell>

                          {/* Product Details */}
                          <TableCell className="py-3">
                            <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              Preço: {Number(p.price).toFixed(2)} {selectedStore?.currency}
                            </div>
                          </TableCell>

                          {/* Category */}
                          <TableCell>
                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/50">
                              {p.category || "Outros"}
                            </span>
                          </TableCell>

                          {/* Status Badge */}
                          <TableCell>
                            {p.status === "out_of_stock" && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full">
                                <XCircle className="h-3 w-3" /> Esgotado
                              </span>
                            )}
                            {p.status === "low_stock" && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-full animate-pulse">
                                <AlertTriangle className="h-3 w-3" /> Stock Baixo
                              </span>
                            )}
                            {p.status === "available" && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                                <CheckCircle className="h-3 w-3" /> Em Stock
                              </span>
                            )}
                            {p.status === "unlimited" && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                                <InfinityIcon className="h-3 w-3" /> Ilimitado
                              </span>
                            )}
                          </TableCell>

                          {/* Quantity Adjuster */}
                          <TableCell className="text-center">
                            {p.stockQty !== null ? (
                              <div className="inline-flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 w-[140px] mx-auto">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-md hover:bg-white shrink-0"
                                  disabled={updateStockMutation.isPending || p.stockQty <= 0}
                                  onClick={() => handleQtyChange(p, Math.max(0, p.stockQty! - 1))}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <input
                                  type="number"
                                  min="0"
                                  value={p.stockQty}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val >= 0) {
                                      handleQtyChange(p, val);
                                    }
                                  }}
                                  className="w-10 text-center font-bold text-sm bg-transparent border-0 focus:ring-0 focus:outline-hidden p-0"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-md hover:bg-white shrink-0"
                                  disabled={updateStockMutation.isPending}
                                  onClick={() => handleQtyChange(p, p.stockQty! + 1)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium italic">—</span>
                            )}
                          </TableCell>

                          {/* Unlimited Switch */}
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={p.stockQty === null}
                                disabled={updateStockMutation.isPending}
                                onCheckedChange={() => handleToggleUnlimited(p, p.stockQty === null)}
                              />
                            </div>
                          </TableCell>

                          {/* Active / In Stock Toggle */}
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end items-center gap-2">
                              <span className={`text-[11px] font-semibold ${p.in_stock ? "text-emerald-600" : "text-slate-400"}`}>
                                {p.in_stock ? "Ativo" : "Inativo"}
                              </span>
                              <Switch
                                checked={p.in_stock}
                                disabled={updateStockMutation.isPending}
                                onCheckedChange={(v) => handleToggleInStock(p, v)}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
