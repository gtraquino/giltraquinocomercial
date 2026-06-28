import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { 
  Download, 
  Upload, 
  Database, 
  FileJson, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  FileText,
  Package,
  Settings,
  ArrowRight,
  ShieldCheck
} from "lucide-react";

interface BackupData {
  version: number;
  backupDate: string;
  storeId: string;
  store: {
    name: string;
    type: string;
    whatsapp: string;
    whatsapp_2: string | null;
    currency: string;
    primary_color: string | null;
    accent_color: string | null;
    opening_time: string | null;
    closing_time: string | null;
    address: string | null;
    hero_title: string | null;
    nif: string | null;
  };
  products: Array<{
    name: string;
    price: number;
    description: string | null;
    image_url: string | null;
    category: string | null;
    in_stock: boolean;
  }>;
  orders: Array<{
    customer_name: string;
    customer_phone: string;
    items: any;
    total: number;
    currency: string;
    created_at: string;
  }>;
}

export default function BackupManager() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  
  // Restore State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [restoreSettings, setRestoreSettings] = useState(true);
  const [restoreProducts, setRestoreProducts] = useState(true);
  const [productsStrategy, setProductsStrategy] = useState<"overwrite" | "merge">("overwrite");
  const [restoreOrders, setRestoreOrders] = useState(false);

  // Query stores managed by the current user
  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ["stores-scoped-backup", isAdmin, user?.id],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.from("stores").select("*").order("name");
        if (error) throw error;
        return data;
      }
      const { data: mgr, error: mgrErr } = await supabase
        .from("store_managers")
        .select("store_id")
        .eq("user_id", user!.id);
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
    if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  // Handle Export / Download
  const handleExportBackup = async () => {
    if (!selectedStoreId || !selectedStore) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma loja para fazer o backup.",
        variant: "destructive",
      });
      return;
    }

    setBackupLoading(true);
    try {
      // 1. Fetch Products
      const { data: productsData, error: prodErr } = await supabase
        .from("products")
        .select("name, price, description, image_url, category, in_stock")
        .eq("store_id", selectedStoreId);
      if (prodErr) throw prodErr;

      // 2. Fetch Orders
      const { data: ordersData, error: ordErr } = await supabase
        .from("orders")
        .select("customer_name, customer_phone, items, total, currency, created_at")
        .eq("store_id", selectedStoreId);
      if (ordErr) throw ordErr;

      // Create structured JSON
      const backup: BackupData = {
        version: 1,
        backupDate: new Date().toISOString(),
        storeId: selectedStoreId,
        store: {
          name: selectedStore.name,
          type: selectedStore.type,
          whatsapp: selectedStore.whatsapp,
          whatsapp_2: selectedStore.whatsapp_2,
          currency: selectedStore.currency,
          primary_color: selectedStore.primary_color,
          accent_color: selectedStore.accent_color,
          opening_time: selectedStore.opening_time,
          closing_time: selectedStore.closing_time,
          address: selectedStore.address,
          hero_title: selectedStore.hero_title,
          nif: selectedStore.nif,
        },
        products: productsData || [],
        orders: ordersData || [],
      };

      // Generate file and download
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backup, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      const cleanStoreName = selectedStore.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", `backup_${cleanStoreName}_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast({
        title: "Backup Concluído! ✅",
        description: `O arquivo da loja ${selectedStore.name} foi guardado no seu computador.`,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro no Backup",
        description: err.message || "Ocorreu um erro ao exportar os dados.",
        variant: "destructive",
      });
    } finally {
      setBackupLoading(false);
    }
  };

  // Handle File Upload and Parsing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.store || !Array.isArray(json.products)) {
          throw new Error("O ficheiro de backup não é válido. Faltam dados essenciais da loja ou produtos.");
        }
        setParsedBackup(json as BackupData);
      } catch (err: any) {
        toast({
          title: "Ficheiro Inválido ❌",
          description: err.message || "Não foi possível ler o arquivo JSON de backup.",
          variant: "destructive",
        });
        setUploadedFile(null);
        setParsedBackup(null);
      }
    };
    reader.readAsText(file);
  };

  // Handle Restore
  const handleRestoreBackup = async () => {
    if (!selectedStoreId || !selectedStore || !parsedBackup) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma loja de destino e carregue um ficheiro válido.",
        variant: "destructive",
      });
      return;
    }

    setRestoreLoading(true);
    try {
      // 1. Restore Store Settings
      if (restoreSettings) {
        const { error: storeErr } = await supabase
          .from("stores")
          .update({
            name: parsedBackup.store.name,
            type: parsedBackup.store.type,
            whatsapp: parsedBackup.store.whatsapp,
            whatsapp_2: parsedBackup.store.whatsapp_2,
            currency: parsedBackup.store.currency,
            primary_color: parsedBackup.store.primary_color,
            accent_color: parsedBackup.store.accent_color,
            opening_time: parsedBackup.store.opening_time,
            closing_time: parsedBackup.store.closing_time,
            address: parsedBackup.store.address,
            hero_title: parsedBackup.store.hero_title,
            nif: parsedBackup.store.nif,
          })
          .eq("id", selectedStoreId);

        if (storeErr) throw storeErr;
      }

      // 2. Restore Products
      if (restoreProducts && parsedBackup.products.length > 0) {
        if (productsStrategy === "overwrite") {
          // Delete existing products
          const { error: delErr } = await supabase
            .from("products")
            .delete()
            .eq("store_id", selectedStoreId);
          if (delErr) throw delErr;

          // Insert new products
          if (parsedBackup.products.length > 0) {
            const { error: insErr } = await supabase
              .from("products")
              .insert(
                parsedBackup.products.map((p) => ({
                  store_id: selectedStoreId,
                  name: p.name,
                  price: p.price,
                  description: p.description,
                  image_url: p.image_url,
                  category: p.category,
                  in_stock: p.in_stock,
                }))
              );
            if (insErr) throw insErr;
          }
        } else {
          // Merge strategy: only insert products that do not exist by name
          const { data: existingProds, error: fetchErr } = await supabase
            .from("products")
            .select("name")
            .eq("store_id", selectedStoreId);
          if (fetchErr) throw fetchErr;

          const existingNames = new Set((existingProds || []).map((p) => p.name.trim().toLowerCase()));
          const toInsert = parsedBackup.products.filter(
            (p) => !existingNames.has(p.name.trim().toLowerCase())
          );

          if (toInsert.length > 0) {
            const { error: insErr } = await supabase
              .from("products")
              .insert(
                toInsert.map((p) => ({
                  store_id: selectedStoreId,
                  name: p.name,
                  price: p.price,
                  description: p.description,
                  image_url: p.image_url,
                  category: p.category,
                  in_stock: p.in_stock,
                }))
              );
            if (insErr) throw insErr;
          }
        }
      }

      // 3. Restore Orders (Historical)
      if (restoreOrders && parsedBackup.orders && parsedBackup.orders.length > 0) {
        const { error: ordErr } = await supabase
          .from("orders")
          .insert(
            parsedBackup.orders.map((o) => ({
              store_id: selectedStoreId,
              customer_name: o.customer_name,
              customer_phone: o.customer_phone,
              items: o.items,
              total: o.total,
              currency: o.currency,
              created_at: o.created_at,
            }))
          );
        if (ordErr) throw ordErr;
      }

      // Refresh query clients
      queryClient.invalidateQueries({ queryKey: ["stores-scoped-backup"] });
      queryClient.invalidateQueries({ queryKey: ["my-managed-stores-billing"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });

      toast({
        title: "Cópia de Segurança Reposta! 🎉",
        description: "Os dados selecionados foram repostos com sucesso na loja.",
      });

      // Clear file inputs
      setUploadedFile(null);
      setParsedBackup(null);
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro na Reposição ❌",
        description: err.message || "Ocorreu um erro ao repor a cópia de segurança.",
        variant: "destructive",
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  if (storesLoading) {
    return (
      <div className="flex justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Gestor de Cópias de Segurança (Backups)
          </h2>
          <p className="text-xs text-muted-foreground">
            Proteja a sua informação exportando-a para o seu disco duro e reponha-a se necessário.
          </p>
        </div>

        {stores.length > 1 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Label htmlFor="store-select" className="text-xs font-bold uppercase shrink-0">Loja:</Label>
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger id="store-select" className="h-9 w-full sm:w-[220px]">
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Backup Card */}
        <Card className="shadow-sm border-slate-100">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
              <Download className="h-5 w-5 text-blue-600" />
              Criar Cópia de Segurança (Download)
            </CardTitle>
            <CardDescription className="text-xs">
              Guarde os dados atuais da loja <span className="font-semibold text-slate-800">{selectedStore?.name}</span> no seu computador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-100/50 rounded-xl p-4 text-xs space-y-3">
              <p className="font-semibold text-blue-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                O arquivo de backup inclui:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-blue-800">
                <li><strong className="text-blue-950">Definições da Loja:</strong> Nome, cores, horários, contactos, morada e NIF.</li>
                <li><strong className="text-blue-950">Catálogo de Produtos:</strong> Nome, preços, categorias, stocks e descrições.</li>
                <li><strong className="text-blue-950">Histórico de Pedidos:</strong> Lista completa de transações e vendas registadas.</li>
              </ul>
            </div>

            <Button 
              onClick={handleExportBackup} 
              disabled={backupLoading || !selectedStoreId}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 py-5"
            >
              {backupLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Descarregar Backup (.JSON)
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Dica: Faça backup regularmente antes de efetuar alterações em massa nos seus produtos.
            </p>
          </CardContent>
        </Card>

        {/* Restore Backup Card */}
        <Card className="shadow-sm border-slate-100">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
              <Upload className="h-5 w-5 text-emerald-600" />
              Repor Cópia de Segurança (Reposição)
            </CardTitle>
            <CardDescription className="text-xs">
              Suba um arquivo de backup (.json) para repor a informação na loja selecionada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-slate-200 hover:border-primary/50 rounded-xl p-4 transition-all flex flex-col items-center justify-center bg-slate-50/50 relative">
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                id="backup-file-upload"
              />
              <FileJson className="h-8 w-8 text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-700">
                {uploadedFile ? uploadedFile.name : "Clique para selecionar o ficheiro de backup"}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Apenas ficheiros .json de backups criados nesta App</p>
            </div>

            {parsedBackup && (
              <div className="space-y-4 bg-slate-50 border rounded-xl p-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-bold text-slate-800">Conteúdo Detetado:</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Lido com Sucesso
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white border rounded-lg p-2 flex flex-col justify-center">
                    <Settings className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                    <span className="font-bold text-slate-800">Definições</span>
                    <span className="text-[10px] text-muted-foreground">{parsedBackup.store.name}</span>
                  </div>
                  <div className="bg-white border rounded-lg p-2 flex flex-col justify-center">
                    <Package className="h-4 w-4 text-amber-600 mx-auto mb-1" />
                    <span className="font-bold text-slate-800">Produtos</span>
                    <span className="text-[10px] text-muted-foreground">{parsedBackup.products.length} itens</span>
                  </div>
                  <div className="bg-white border rounded-lg p-2 flex flex-col justify-center">
                    <FileText className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                    <span className="font-bold text-slate-800">Pedidos</span>
                    <span className="text-[10px] text-muted-foreground">{parsedBackup.orders?.length || 0} reg.</span>
                  </div>
                </div>

                {/* Configuration Options */}
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Opções de Reposição:</p>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="restore-settings" className="text-xs font-semibold cursor-pointer">
                      Repor Definições da Loja
                    </Label>
                    <Switch 
                      id="restore-settings" 
                      checked={restoreSettings} 
                      onCheckedChange={setRestoreSettings} 
                    />
                  </div>

                  <div className="border-t pt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="restore-products" className="text-xs font-semibold cursor-pointer">
                        Repor Catálogo de Produtos ({parsedBackup.products.length})
                      </Label>
                      <Switch 
                        id="restore-products" 
                        checked={restoreProducts} 
                        onCheckedChange={setRestoreProducts} 
                      />
                    </div>

                    {restoreProducts && (
                      <div className="pl-4 pt-1 flex flex-col gap-1">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">Estratégia:</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setProductsStrategy("overwrite")}
                            className={`p-1.5 rounded-md border text-[10px] font-bold transition-all text-center ${productsStrategy === "overwrite" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 hover:bg-slate-100"}`}
                          >
                            Substituir Tudo (Apaga atuais)
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductsStrategy("merge")}
                            className={`p-1.5 rounded-md border text-[10px] font-bold transition-all text-center ${productsStrategy === "merge" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 hover:bg-slate-100"}`}
                          >
                            Mesclar / Fundir (Mantém atuais)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t pt-2">
                    <Label htmlFor="restore-orders" className="text-xs font-semibold cursor-pointer flex items-center gap-1">
                      Repor Histórico de Pedidos ({parsedBackup.orders?.length || 0})
                    </Label>
                    <Switch 
                      id="restore-orders" 
                      checked={restoreOrders} 
                      onCheckedChange={setRestoreOrders} 
                    />
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Atenção ao Destino:</p>
                    <p>Esta operação irá repor estes dados na loja <strong className="text-amber-950 underline">{selectedStore?.name}</strong>. Esta ação não pode ser desfeita!</p>
                  </div>
                </div>

                <Button 
                  onClick={handleRestoreBackup} 
                  disabled={restoreLoading || (!restoreSettings && !restoreProducts && !restoreOrders)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 py-5 mt-2"
                >
                  {restoreLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Confirmar e Repor Dados
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
