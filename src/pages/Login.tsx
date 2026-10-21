import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Store, KeyRound, ArrowRight, ShieldCheck, Mail, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [mode, setMode] = useState<"login" | "forgot_password" | "update_password">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const normalizedEmail = email.trim().toLowerCase();

  // Detetar se a página foi aberta através de um link de recuperação de palavra-passe
  useEffect(() => {
    if (
      window.location.hash.includes("type=recovery") || 
      window.location.search.includes("type=recovery") ||
      window.location.href.includes("type=recovery")
    ) {
      setMode("update_password");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update_password");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Redireciona utilizadores com sessão válida, exceto se estiverem em modo de atualização de palavra-passe
  useEffect(() => {
    if (!authLoading && user && mode !== "update_password") {
      navigate(isAdmin ? "/admin" : "/manager", { replace: true });
    }
  }, [authLoading, navigate, user, isAdmin, mode]);

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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({
        title: "Palavra-passe muito curta",
        description: "A palavra-passe deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast({
        title: "As senhas não coincidem",
        description: "Por favor confirme que ambas as senhas são iguais.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        toast({
          title: "Erro ao atualizar senha",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Palavra-passe atualizada com sucesso!",
        description: "Acedendo à plataforma...",
      });

      navigate(isAdmin ? "/admin" : "/manager", { replace: true });
    } catch (err) {
      toast({
        title: "Erro",
        description: (err as Error).message,
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
            {mode === "login" && "Entrar na Plataforma"}
            {mode === "forgot_password" && "Recuperar Palavra-passe"}
            {mode === "update_password" && "Definir Nova Palavra-passe"}
          </CardTitle>
          <CardDescription className="text-xs">
            {mode === "login" && "Aceda com as suas credenciais de gestor ou administrador"}
            {mode === "forgot_password" && "Introduza o seu email para receber um link seguro de redefinição"}
            {mode === "update_password" && "Introduza a sua nova palavra-passe segura para concluir a redefinição"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {mode === "login" && (
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
          )}

          {mode === "forgot_password" && (
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

          {mode === "update_password" && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs text-foreground flex items-start gap-2">
                <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Link de Recuperação Validado:</strong> Escolha a sua nova palavra-passe abaixo para atualizar a sua conta.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Nova Palavra-passe</label>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Confirmar Nova Palavra-passe</label>
                <Input
                  type="password"
                  placeholder="Repita a palavra-passe"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" className="w-full font-semibold gap-1.5" disabled={loading}>
                <KeyRound className="h-4 w-4" />
                {loading ? "A atualizar palavra-passe..." : "Guardar Senha e Entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
