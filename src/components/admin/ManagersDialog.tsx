import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Users,
  Trash2,
  Plus,
  Copy,
  Check,
  Key,
  KeyRound,
  ShieldAlert,
  ExternalLink,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  CalendarCheck,
  PackagePlus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  listStoreManagers,
  assignStoreManager,
  removeStoreManager,
  updateManagerPassword,
  StoreManagerInfo,
  AssignResult,
} from "@/lib/managerStores";
import { isStoreBlocked, addPeriod } from "@/lib/billing";
import { supabase } from "@/integrations/supabase/client";

export interface StoreBillingData {
  id: string;
  name: string;
  slug?: string | null;
  currency?: string | null;
  whatsapp?: string | null;
  is_blocked?: boolean | null;
  paid_until?: string | null;
  subscription_amount?: number | null;
  subscription_period?: string | null;
}

interface Props {
  storeId: string;
  storeName: string;
  store?: StoreBillingData | null;
  customTrigger?: React.ReactNode;
}

export default function ManagersDialog({ storeId, storeName, store, customTrigger }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lastResult, setLastResult] = useState<AssignResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const qc = useQueryClient();

  const isBlocked = isStoreBlocked(store);
  const isUpToDate = !isBlocked;

  const { data: managers = [], isLoading } = useQuery({
    queryKey: ["store-managers", storeId],
    queryFn: () => listStoreManagers(storeId),
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await assignStoreManager(storeId, email, password || undefined);
      return res;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["store-managers", storeId] });
      qc.invalidateQueries({ queryKey: ["stores"] });
      setLastResult(result);
      setEmail("");
      setPassword("");

      toast({
        title: result.created ? "Gestor criado com sucesso!" : "Gestor associado à loja!",
        description: `O email ${result.email} já pode aceder para criar e gerir produtos.`,
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Aviso",
        description: e.message || "Não foi possível concluir a associação.",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (m: StoreManagerInfo) => removeStoreManager(storeId, m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-managers", storeId] });
      qc.invalidateQueries({ queryKey: ["stores"] });
      toast({ title: "Gestor removido da loja" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    },
  });

  const regularizeMutation = useMutation({
    mutationFn: async () => {
      const today = new Date();
      const currentPaid = store?.paid_until ? new Date(store.paid_until) : null;
      const base = currentPaid && currentPaid > today ? currentPaid : today;
      const newPaidUntil = addPeriod(base, "monthly");

      const { error } = await supabase
        .from("stores")
        .update({
          paid_until: newPaidUntil,
          is_blocked: false,
        })
        .eq("id", storeId);

      if (error) throw error;
      return newPaidUntil;
    },
    onSuccess: (newPaidUntil) => {
      qc.invalidateQueries({ queryKey: ["stores"] });
      qc.invalidateQueries({ queryKey: ["billing-stores"] });
      toast({
        title: "Mensalidade regularizada com sucesso!",
        description: `A loja agora está em dia até ${newPaidUntil}. O link e o acesso do gestor foram desbloqueados.`,
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao regularizar mensalidade",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const loginUrl = `${window.location.origin}/login`;
  const catalogUrl = `${window.location.origin}/loja/${store?.slug || storeId}`;

  const buildManagerInvitationText = (targetEmail?: string, tempPass?: string) => {
    return [
      `*Acesso de Gestor - ${storeName}*`,
      ``,
      `Olá! Seguem os detalhes de acesso ao Painel da loja *${storeName}* para gerir produtos, preços e encomendas:`,
      ``,
      `🔗 *Painel do Gestor:* ${loginUrl}`,
      targetEmail ? `📧 *Email de acesso:* ${targetEmail}` : `📧 *Email:* (Utilize o seu email de gestor)`,
      tempPass ? `🔑 *Palavra-passe provisória:* ${tempPass}` : null,
      ``,
      `📌 *Como criar os seus produtos:*`,
      `1. Abra o link do painel: ${loginUrl}`,
      `2. Inicie sessão com o seu email e palavra-passe`,
      `3. Aceda ao separador *"Produtos"* e clique em *"+ Novo Produto"*`,
      `4. Introduza o nome, preço, imagem do produto e guarde`,
      `5. Verifique o seu stock no menu *"Stock"*`,
      ``,
      `🛍️ *Link do seu Catálogo Público para os clientes:*`,
      `${catalogUrl}`,
      ``,
      `Boas vendas!`,
    ]
      .filter((line) => line !== null)
      .join("\n");
  };

  const handleCopyDirectLink = async () => {
    await navigator.clipboard.writeText(loginUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast({
      title: "Link do gestor copiado!",
      description: "O endereço do painel de login foi copiado para a área de transferência.",
    });
  };

  const handleCopyFullInvitation = async (targetEmail?: string, tempPass?: string) => {
    const text = buildManagerInvitationText(targetEmail, tempPass);
    await navigator.clipboard.writeText(text);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
    toast({
      title: "Convite completo copiado!",
      description: "Pode colar diretamente no WhatsApp ou email do gestor.",
    });
  };

  const handleSendWhatsApp = (targetEmail?: string, tempPass?: string) => {
    const text = buildManagerInvitationText(targetEmail, tempPass);
    const cleanPhone = (store?.whatsapp || "").replace(/[^0-9]/g, "");
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  const [changingPasswordFor, setChangingPasswordFor] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [updatingPass, setUpdatingPass] = useState(false);

  const handleUpdatePasswordDirectly = async (targetEmail: string) => {
    if (!newPasswordValue || newPasswordValue.length < 6) {
      toast({
        title: "Palavra-passe inválida",
        description: "A palavra-passe deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingPass(true);
    try {
      const res = await updateManagerPassword(storeId, targetEmail, newPasswordValue);
      if (!res.ok) {
        throw new Error(res.error || "Não foi possível atualizar a palavra-passe.");
      }

      toast({
        title: "Palavra-passe alterada com sucesso!",
        description: `O gestor (${targetEmail}) já pode aceder com a nova palavra-passe em /login.`,
      });
      setChangingPasswordFor(null);
      setNewPasswordValue("");
    } catch (err) {
      toast({
        title: "Erro ao atualizar palavra-passe",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setUpdatingPass(false);
    }
  };

  const sqlSnippet = `-- ==============================================================================
-- ATIVAÇÃO IMEDIATA DE GESTORES & REGRAS RLS (SEM NECESSIDADE DE EMAILS)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

UPDATE auth.users 
SET email_confirmed_at = COALESCE(email_confirmed_at, now()) 
WHERE email_confirmed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.store_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);
ALTER TABLE public.store_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and owners manage store_managers" ON public.store_managers;
CREATE POLICY "Admins and owners manage store_managers" ON public.store_managers FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_managers.store_id AND s.created_by = auth.uid())
);

DROP POLICY IF EXISTS "Managers can view their own store_managers" ON public.store_managers;
CREATE POLICY "Managers can view their own store_managers" ON public.store_managers FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.create_or_assign_manager(
  _store_id uuid,
  _email text,
  _password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_user_id uuid;
  clean_email text := lower(trim(_email));
  clean_password text := trim(COALESCE(_password, ''));
  is_new boolean := false;
  store_exists boolean;
  hashed_pwd text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stores 
    WHERE id = _store_id AND (created_by = caller_id OR public.has_role(caller_id, 'admin'::public.app_role))
  ) INTO store_exists;

  IF NOT store_exists THEN
    RAISE EXCEPTION 'Não tem permissão para gerir os utilizadores desta loja.';
  END IF;

  IF clean_email = '' OR clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Endereço de email inválido.';
  END IF;

  IF clean_password = '' THEN
    clean_password := 'Gestor' || floor(random() * 8999 + 1000)::text || '!';
  END IF;

  hashed_pwd := extensions.crypt(clean_password, extensions.gen_salt('bf'));

  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE lower(email) = clean_email 
  LIMIT 1;

  IF target_user_id IS NULL THEN
    target_user_id := gen_random_uuid();
    is_new := true;

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      target_user_id, '00000000-0000-0000-0000-000000000000', clean_email, hashed_pwd, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', now(), now()
    );

    BEGIN
      INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (target_user_id::text, target_user_id, jsonb_build_object('sub', target_user_id::text, 'email', clean_email), 'email', now(), now(), now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'user'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = hashed_pwd,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  INSERT INTO public.store_managers (store_id, user_id)
  VALUES (_store_id, target_user_id)
  ON CONFLICT (user_id, store_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'user_id', target_user_id, 'email', clean_email, 'password', clean_password, 'created', is_new);
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_assign_manager(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_assign_manager(uuid, text, text) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';`;

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(sqlSnippet);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
    toast({ title: "SQL Copiado", description: "Pode colar no SQL Editor do Supabase." });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setLastResult(null);
          setEmail("");
          setPassword("");
        }
      }}
    >
      <DialogTrigger asChild>
        {customTrigger ? (
          customTrigger
        ) : (
          <Button
            variant={isBlocked ? "outline" : "default"}
            size="sm"
            className={`gap-1.5 font-semibold text-xs shadow-sm transition-all ${
              isBlocked
                ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Link do Gestor</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-4">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <KeyRound className="h-5 w-5 text-primary shrink-0" />
              <span>Link & Acesso do Gestor — {storeName}</span>
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Status da Mensalidade - Regra solicitada pelo utilizador */}
          {isBlocked ? (
            <div className="rounded-lg border-2 border-destructive/40 bg-destructive/10 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-destructive">
                      Acesso Bloqueado — Mensalidade em Atraso
                    </span>
                    <Badge variant="destructive" className="text-[10px]">
                      Pendente
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Esta loja está com a mensalidade em atraso ou o acesso bloqueado pelo sistema.
                    O gestor <strong>não conseguirá entrar no painel para criar produtos</strong> enquanto a mensalidade não for regularizada.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => regularizeMutation.mutate()}
                  disabled={regularizeMutation.isPending}
                  className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <CalendarCheck className="h-3.5 w-3.5" />
                  <span>{regularizeMutation.isPending ? "A regularizar..." : "Regularizar Mensalidade (+30 Dias)"}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const reminder = `*Aviso de Mensalidade - Loja ${storeName}*\n\nOlá! Informamos que a mensalidade da sua loja encontra-se pendente. Para que o gestor possa aceder ao painel e criar novos produtos, por favor regularize o pagamento.`;
                    const cleanPhone = (store?.whatsapp || "").replace(/[^0-9]/g, "");
                    const wa = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminder)}` : `https://wa.me/?text=${encodeURIComponent(reminder)}`;
                    window.open(wa, "_blank");
                  }}
                  className="gap-1.5 text-xs"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Cobrar via WhatsApp</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Mensalidade em Dia — Acesso do Gestor Autorizado
                </span>
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                  {store?.paid_until ? `Válida até ${store.paid_until}` : "Subscrição Ativa"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Esta loja tem as mensalidades em dia. O gestor pode aceder diretamente para cadastrar e publicar produtos, gerir preços, fotos e controlar o stock.
              </p>
            </div>
          )}

          {/* Secção de Geração e Envio de Link do Gestor */}
          <div className="rounded-lg border bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <PackagePlus className="h-4 w-4 text-primary" />
                  <span>Link de Acesso para Criar Produtos</span>
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Envie este link ao gestor da loja para ele entrar e gerir o catálogo de produtos.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-muted/60 rounded-md p-2 border font-mono text-xs">
              <span className="flex-1 truncate select-all text-foreground">{loginUrl}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyDirectLink}
                className="h-7 text-xs gap-1 shrink-0"
              >
                {copiedLink ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedLink ? "Copiado" : "Copiar Link"}</span>
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => handleCopyFullInvitation(managers[0]?.email)}
                className="gap-1.5 text-xs font-semibold"
              >
                {copiedMessage ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedMessage ? "Mensagem Copiada!" : "Copiar Convite com Instruções"}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSendWhatsApp(managers[0]?.email)}
                className="gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 font-semibold"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span>Enviar pelo WhatsApp</span>
              </Button>

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <a href={catalogUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  <span>Ver Catálogo da Loja</span>
                </a>
              </Button>
            </div>
          </div>

          {/* Formulário: Criar / Associar Novo Gestor */}
          <div className="rounded-lg border p-3.5 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span>Criar ou Associar Gestor à Loja</span>
              </Label>
              <span className="text-[11px] text-emerald-600 font-medium">Acesso Imediato</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="mgr-email" className="text-xs">Email do gestor</Label>
                <Input
                  id="mgr-email"
                  type="email"
                  placeholder="gestor@loja.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="mgr-pass" className="text-xs">Palavra-passe de acesso</Label>
                <Input
                  id="mgr-pass"
                  type="text"
                  placeholder="Ex: Gestor1234 (automática se vazio)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={() => addMutation.mutate()}
              disabled={!email.trim() || addMutation.isPending}
              className="w-full gap-2 text-xs font-semibold h-8"
            >
              {addMutation.isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>A ativar gestor...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Criar Gestor e Gerar Credenciais</span>
                </>
              )}
            </Button>
          </div>

          {/* Resultado de criação recente */}
          {lastResult && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3.5 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  Gestor Ativado com Sucesso!
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono font-semibold">
                  {lastResult.email}
                </span>
              </div>

              {lastResult.tempPassword && (
                <div className="flex items-center justify-between bg-background/90 rounded px-2.5 py-1.5 border text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Key className="h-3.5 w-3.5" /> Senha gerada:
                  </span>
                  <strong className="font-mono text-foreground font-bold">{lastResult.tempPassword}</strong>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCopyFullInvitation(lastResult.email, lastResult.tempPassword)}
                  className="flex-1 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar Credenciais</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendWhatsApp(lastResult.email, lastResult.tempPassword)}
                  className="gap-1.5 text-xs text-emerald-700 border-emerald-500/30"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                </Button>
              </div>
            </div>
          )}

          {/* Lista de Gestores Atribuídos */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Gestores com Acesso a esta Loja
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {isLoading ? "..." : `${managers.length} gestor(es)`}
              </span>
            </div>

            {isLoading ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                A carregar gestores...
              </div>
            ) : managers.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                Nenhum gestor associado a esta loja ainda. Crie um acima para permitir que ele adicione produtos.
              </div>
            ) : (
              <ul className="space-y-2">
                {managers.map((m) => {
                  const isEditingThis = changingPasswordFor === m.email;

                  return (
                    <li
                      key={m.id || m.user_id}
                      className="rounded-lg border bg-card p-2.5 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground truncate">{m.email}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ID: {m.user_id.slice(0, 8)}... • Acesso a produtos e pedidos
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1"
                            title="Copiar dados de acesso deste gestor"
                            onClick={() => handleCopyFullInvitation(m.email)}
                          >
                            <Copy className="h-3 w-3" />
                            <span className="hidden sm:inline">Copiar</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-emerald-700 border-emerald-500/30"
                            title="Enviar acesso via WhatsApp"
                            onClick={() => handleSendWhatsApp(m.email)}
                          >
                            <MessageCircle className="h-3 w-3 text-emerald-600" />
                            <span className="hidden sm:inline">WhatsApp</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1"
                            title="Alterar palavra-passe diretamente (sem emails)"
                            onClick={() => {
                              if (isEditingThis) {
                                setChangingPasswordFor(null);
                                setNewPasswordValue("");
                              } else {
                                setChangingPasswordFor(m.email);
                                setNewPasswordValue("");
                              }
                            }}
                          >
                            <Key className="h-3 w-3 text-amber-600" />
                            <span>{isEditingThis ? "Fechar" : "Nova Senha"}</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            title="Remover gestor da loja"
                            onClick={() => removeMutation.mutate(m)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Definir nova senha para este gestor */}
                      {isEditingThis && (
                        <div className="bg-muted/50 p-2.5 rounded-md space-y-2 border">
                          <p className="text-[11px] text-muted-foreground">
                            Defina uma nova palavra-passe diretamente para <strong>{m.email}</strong>:
                          </p>
                          <div className="flex gap-1.5">
                            <Input
                              type="text"
                              value={newPasswordValue}
                              onChange={(e) => setNewPasswordValue(e.target.value)}
                              placeholder="Nova senha (ex: Gestor2026!)"
                              className="h-7 text-xs flex-1 font-mono"
                            />
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2.5 bg-primary"
                              disabled={updatingPass || !newPasswordValue}
                              onClick={() => handleUpdatePasswordDirectly(m.email)}
                            >
                              {updatingPass ? "A guardar..." : "Guardar"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Auxiliar técnico do Supabase (para caso ainda falte executar a função de gestor) */}
          <div className="rounded-lg border border-muted bg-muted/30 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                Script de permissões do Supabase (Opcional)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopySql}
                className="h-6 text-[10px] gap-1 px-2"
              >
                {copiedSql ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedSql ? "Copiado" : "Copiar SQL"}</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
