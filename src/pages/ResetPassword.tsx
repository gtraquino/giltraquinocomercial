import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { KeyRound } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state change event on ResetPassword page:", event);
      if (
        event === "PASSWORD_RECOVERY" || 
        event === "SIGNED_IN" || 
        (event === "INITIAL_SESSION" && session)
      ) {
        setReady(true);
      }
    });

    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const errorDesc = url.searchParams.get("error_description") || url.hash.match(/error_description=([^&]+)/)?.[1];

      if (errorDesc) {
        const decodedError = decodeURIComponent(errorDesc).replace(/\+/g, " ");
        setErrorMsg(decodedError);
        toast({ title: "Link inválido", description: decodedError, variant: "destructive" });
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMsg(error.message);
          toast({ title: "Erro", description: error.message, variant: "destructive" });
          return;
        }
        setReady(true);
        window.history.replaceState({}, "", "/reset-password");
        return;
      }

      // Fallback: hash-based recovery tokens or existing active session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
      } else {
        // If there's no code and no access_token / recovery type in hash, it's missing
        const hash = window.location.hash;
        if (!hash.includes("access_token") && !hash.includes("recovery")) {
          setErrorMsg("Sessão não encontrada ou link de recuperação em falta.");
        }
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Erro", description: "As palavras-passe não coincidem.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Erro", description: "Mínimo de 6 caracteres.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Palavra-passe atualizada", description: "A redirecionar..." });
    setTimeout(() => navigate("/admin", { replace: true }), 1000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Nova palavra-passe</CardTitle>
          <CardDescription>
            {errorMsg ? "Ocorreu um problema" : ready ? "Defina a sua nova palavra-passe" : "A validar link de recuperação..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="space-y-4 text-center py-2">
              <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-lg border border-destructive/20 leading-relaxed">
                {errorMsg === "Sessão não encontrada ou link de recuperação em falta." 
                  ? "Não foi encontrada nenhuma sessão de recuperação ativa ou o link é inválido."
                  : errorMsg}
              </p>
              <p className="text-xs text-muted-foreground">
                Este link pode ter expirado ou já ter sido utilizado. Por favor, peça ao administrador para gerar um novo convite/link de acesso para o seu utilizador.
              </p>
              <Button onClick={() => navigate("/login")} variant="outline" className="w-full">
                Voltar ao Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Nova palavra-passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={!ready}
              />
              <Input
                type="password"
                placeholder="Confirmar palavra-passe"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                disabled={!ready}
              />
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading ? "A guardar..." : "Atualizar palavra-passe"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
