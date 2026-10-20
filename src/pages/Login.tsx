import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Store, KeyRound, ArrowRight, ShieldCheck, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [mode, setMode] = useState<"login" | "forgot_password">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const normalizedEmail = email.trim().toLowerCase();

  // Redireciona automaticamente utilizadores já com sessão válida
  useEffect(() => {
    if (!authLoading && user) {
      navigate(isAdmin ? "/admin" : "/manager", { replace: true });
    }
  }, [authLoading, navigate, user, isAdmin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedEmail || !password) {
      toast({
        title: "Campos obrigatórios",
        description: "Introduza o seu email e palavra-passe.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        toast({
          title: "Falha na autenticação",
          description: "Email ou palavra-passe incorretos.",
          variant: "destructive",
        });
        return;
      }

      if (data?.session) {
        toast({
          title: "Sessão iniciada",
          description: "A carregar o seu espaço de trabalho...",
        });
      }
    } catch {
      toast({
        title: "Erro de autenticação",
        description: "Ocorreu um erro ao processar o seu login. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      toast({
        title: "Email inválido",
        description: "Por favor introduza um endereço de correio eletrónico válido.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) {
        console.warn("Erro ao enviar email de recuperação:", error.message);
      }

      // Por segurança contra enumeração de utilizadores, mostra sempre confirmação
      setResetSent(true);
      toast({
        title: "Instruções enviadas",
        description: "Se o email estiver registado, receberá uma mensagem para redefinir a sua senha.",
      });
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível enviar a recuperação no momento. Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md shadow-xl border-border/60 bg-card">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Store className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {mode === "login" ? "Entrar na Plataforma" : "Recuperar Palavra-passe"}
          </CardTitle>
          <CardDescription className="text-xs">
            {mode === "login"
              ? "Aceda com as suas credenciais de gestor ou administrador"
              : "Introduza o seu email para receber um link seguro de redefinição"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Email da Conta</label>
                <Input
                  type="email"
                  placeholder="utilizador@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Palavra-passe</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot_password");
                      setResetSent(false);
                    }}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Esqueceu-se da senha?
                  </button>
                </div>
                <Input
                  type="password"
                  placeholder="Introduza a sua palavra-passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" className="w-full font-semibold gap-1.5" disabled={loading}>
                {loading ? "A autenticar..." : "Iniciar Sessão"}
                <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Acesso seguro protegido por autenticação encriptada
                </p>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {resetSent ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-3">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                  <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                    Instruções enviadas com sucesso!
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Verifique a caixa de entrada de <strong>{normalizedEmail}</strong> para aceder ao link de redefinição de palavra-passe.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-semibold"
                    onClick={() => {
                      setMode("login");
                      setResetSent(false);
                    }}
                  >
                    Voltar ao Login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Email da Conta</label>
                    <Input
                      type="email"
                      placeholder="utilizador@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <Button type="submit" className="w-full font-semibold gap-1.5" disabled={loading}>
                    <Mail className="h-4 w-4" />
                    {loading ? "A enviar..." : "Enviar Link de Recuperação"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs font-medium gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setMode("login")}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar para o Início de Sessão
                  </Button>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
