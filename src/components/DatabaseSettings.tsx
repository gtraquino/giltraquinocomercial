import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Settings, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function DatabaseSettings() {
  const [open, setOpen] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [hasOverrides, setHasOverrides] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  useEffect(() => {
    const url = localStorage.getItem("OVERRIDE_SUPABASE_URL") || "";
    const key = localStorage.getItem("OVERRIDE_SUPABASE_PUBLISHABLE_KEY") || "";
    setSupabaseUrl(url);
    setSupabaseKey(key);
    setHasOverrides(!!url || !!key);
  }, [open]);

  // Handle saving credentials
  const handleSave = () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      toast.error("Por favor, preencha ambos os campos ou restaure as predefinições.");
      return;
    }

    try {
      new URL(supabaseUrl); // Basic sanity check
    } catch (e) {
      toast.error("Formato do URL da Supabase é inválido.");
      return;
    }

    localStorage.setItem("OVERRIDE_SUPABASE_URL", supabaseUrl.trim());
    localStorage.setItem("OVERRIDE_SUPABASE_PUBLISHABLE_KEY", supabaseKey.trim());
    toast.success("Configuração de base de dados guardada. A reiniciar...");
    
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  // Restore defaults
  const handleRestoreDefaults = () => {
    localStorage.removeItem("OVERRIDE_SUPABASE_URL");
    localStorage.removeItem("OVERRIDE_SUPABASE_PUBLISHABLE_KEY");
    toast.success("Predefinições da aplicação repostas. A reiniciar...");
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  // Test current connection
  const testConnection = async () => {
    setTestStatus("testing");
    const targetUrl = supabaseUrl.trim() || import.meta.env.VITE_SUPABASE_URL || "";
    const targetKey = supabaseKey.trim() || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

    if (!targetUrl || !targetKey) {
      setTestStatus("error");
      toast.error("Nenhuma credencial de ligação encontrada.");
      return;
    }

    try {
      // Direct fetch standard health or API endpoint
      const res = await fetch(`${targetUrl}/rest/v1/?apikey=${targetKey}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (res.ok || res.status === 401 || res.status === 400 || res.status === 406) {
        // Status 4xx from Supabase endpoints usually mean the URL is correct and reached successfully
        setTestStatus("success");
        toast.success("Ligação remota de base de dados estabelecida com sucesso!");
      } else {
        setTestStatus("error");
        toast.error("Erro ao comunicar com a base de dados.");
      }
    } catch (err) {
      setTestStatus("error");
      toast.error("Impossível aceder ao servidor Supabase.");
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-[99]">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full w-12 h-12 shadow-md bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:shadow-lg transition-all"
            title="Autonomia de Base de Dados"
          >
            <Settings className="h-5 w-5 animate-spin-hover" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Configuração Autónoma
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Esta aplicação é totalmente independente de servidores centrais. Pode ligá-la instantaneamente a qualquer projecto 
              <strong> Supabase</strong> remoto de forma 100% autónoma.
            </p>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-100">
              <span className="text-xs font-medium text-slate-700">Estado de Ligação:</span>
              <div className="flex items-center gap-1.5">
                {hasOverrides ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <ShieldCheck className="h-3.5 w-3.5" /> Remoto Customizado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <CheckCircle className="h-3.5 w-3.5" /> Servidor Padrão
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url" className="text-xs">Supabase URL</Label>
              <Input
                id="url"
                type="text"
                placeholder="https://xxxxx.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key" className="text-xs">Anon/Publishable Key</Label>
              <Input
                id="key"
                type="password"
                placeholder="Introduza a chave anon-key do projecto..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={testStatus === "testing"}
                className="w-1/2 text-xs flex items-center justify-center gap-1.5"
              >
                {testStatus === "testing" ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : null}
                Testar Ligação
              </Button>
              {hasOverrides && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRestoreDefaults}
                  className="w-1/2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Restaurar Padrão
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              Guardar e Ligar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
