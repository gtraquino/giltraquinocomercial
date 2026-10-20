import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Users, Trash2, Plus, Copy, Check, Key, ShieldAlert, ExternalLink } from "lucide-react";
import {
  listStoreManagers,
  assignStoreManager,
  removeStoreManager,
  updateManagerPassword,
  StoreManagerInfo,
  AssignResult,
} from "@/lib/managerStores";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  storeId: string;
  storeName: string;
}

export default function ManagersDialog({ storeId, storeName }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lastResult, setLastResult] = useState<AssignResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const qc = useQueryClient();

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
      setCopied(false);

      toast({
        title: result.created ? "Gestor criado com sucesso" : "Gestor associado à loja",
        description: `O email ${result.email} foi associado à loja ${storeName}.`,
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

  const handleCopyAccess = async () => {
    if (!lastResult) return;
    const loginUrl = `${window.location.origin}/login`;
    const text = [
      `*Acesso de Gestor - ${storeName}*`,
      `Loja: ${storeName}`,
      `Painel de Gestor: ${loginUrl}`,
      `Email: ${lastResult.email}`,
      lastResult.tempPassword ? `Palavra-passe: ${lastResult.tempPassword}` : null,
      ``,
      `Aceda ao link acima para gerir os produtos, pedidos e links da loja.`,
    ]
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copiado!", description: "Dados de acesso copiados para a área de transferência." });
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

-- 1. Confirmar utilizadores pendentes para permitir acesso imediato
UPDATE auth.users 
SET email_confirmed_at = COALESCE(email_confirmed_at, now()) 
WHERE email_confirmed_at IS NULL;

-- 2. Tabela de gestores de loja
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
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_managers.store_id AND s.created_by = auth.uid())
);

DROP POLICY IF EXISTS "Managers can view their own store_managers" ON public.store_managers;
CREATE POLICY "Managers can view their own store_managers" ON public.store_managers FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 3. Função atómica para criar gestores já com email confirmado e senha direta
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
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      role,
      aud,
      created_at,
      updated_at
    ) VALUES (
      target_user_id,
      '00000000-0000-0000-0000-000000000000',
      clean_email,
      hashed_pwd,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        target_user_id::text,
        target_user_id,
        jsonb_build_object('sub', target_user_id::text, 'email', clean_email),
        'email',
        now(),
        now(),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
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

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', target_user_id,
    'email', clean_email,
    'password', clean_password,
    'created', is_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_assign_manager(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_assign_manager(uuid, text, text) TO anon, authenticated, service_role;

-- 4. Função pública para definir senha diretamente no painel de login sem email
CREATE OR REPLACE FUNCTION public.set_or_create_user_password(
  p_email text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  clean_email text := lower(trim(p_email));
  clean_password text := trim(p_password);
  target_user_id uuid;
  hashed_pwd text;
BEGIN
  IF clean_email = '' OR clean_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email inválido');
  END IF;

  hashed_pwd := extensions.crypt(clean_password, extensions.gen_salt('bf'));

  SELECT id INTO target_user_id FROM auth.users WHERE lower(email) = clean_email LIMIT 1;

  IF target_user_id IS NULL THEN
    target_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      target_user_id, '00000000-0000-0000-0000-000000000000',
      clean_email, hashed_pwd, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      'authenticated', 'authenticated', now(), now()
    );

    BEGIN
      INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (target_user_id::text, target_user_id, jsonb_build_object('sub', target_user_id::text, 'email', clean_email), 'email', now(), now(), now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, CASE WHEN clean_email IN ('g.traquino66@gmail.com', 'giltraquino@gmail.com') THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = hashed_pwd,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'email', clean_email);
END;
$$;

REVOKE ALL ON FUNCTION public.set_or_create_user_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_or_create_user_password(text, text) TO anon, authenticated, service_role;
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
        <Button variant="outline" size="sm" className="gap-1 font-medium">
          <Users className="h-3.5 w-3.5" /> Gestores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <span>Gestores de "{storeName}"</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <span>Atribuir Gestor à Loja</span>
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Introduza o email do gestor. A conta será criada ou associada diretamente a esta loja. O gestor poderá iniciar sessão em <strong>/login</strong> para gerir os produtos e encomendas.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="manager-email" className="text-xs font-semibold">
                Email do gestor
              </Label>
              <Input
                id="manager-email"
                type="email"
                placeholder="gestor@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim() && !addMutation.isPending) {
                    addMutation.mutate();
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="manager-pass" className="text-xs font-semibold">
                  Palavra-passe de acesso
                </Label>
                <span className="text-[11px] text-emerald-600 font-medium">Sem email</span>
              </div>
              <Input
                id="manager-pass"
                type="text"
                placeholder="Ex: 12345678 (padrão se vazio)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                O gestor entra logo em <strong>/login</strong> com esta palavra-passe. Não precisa de confirmação por email.
              </p>
            </div>

            <Button
              onClick={() => addMutation.mutate()}
              disabled={!email.trim() || addMutation.isPending}
              className="w-full gap-2 font-semibold"
            >
              {addMutation.isPending ? (
                <span>A criar e ativar gestor...</span>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Criar e Ativar Gestor (Sem Email)</span>
                </>
              )}
            </Button>
          </div>

          {/* Result card with copyable credentials */}
          {lastResult && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5 space-y-2.5 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-600" />
                  Gestor Configurado!
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                  {lastResult.email}
                </span>
              </div>

              {lastResult.tempPassword && (
                <div className="flex items-center justify-between bg-background/80 rounded px-2.5 py-1.5 border text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Key className="h-3.5 w-3.5" /> Senha:
                  </span>
                  <strong className="font-mono text-foreground">{lastResult.tempPassword}</strong>
                </div>
              )}

              <div className="pt-1">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleCopyAccess}
                  className="w-full gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copiado!" : "Copiar Dados de Acesso (WhatsApp / Mensagem)"}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Current managers list */}
          <div className="border-t pt-3.5">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Gestores atribuídos
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
                Nenhum gestor atribuído a esta loja ainda.
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
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{m.email}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ID: {m.user_id.slice(0, 8)}...
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
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

                      {/* Inline password setter */}
                      {isEditingThis && (
                        <div className="bg-muted/50 p-2 rounded-md space-y-2 border">
                          <p className="text-[11px] text-muted-foreground">
                            Defina uma nova palavra-passe diretamente para <strong>{m.email}</strong>. Não envia emails e funciona de imediato:
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

          {/* Notice about Supabase SQL permissions */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-amber-900 dark:text-amber-300">
                  Permissões de Gestor no Supabase
                </p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Para habilitar todas as regras de segurança RLS na base de dados, execute o script de permissões no seu SQL Editor do Supabase.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopySql}
                className="h-7 text-[11px] gap-1.5 flex-1"
              >
                {copiedSql ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedSql ? "SQL Copiado!" : "Copiar Script SQL"}</span>
              </Button>
              <a
                href="https://supabase.com/dashboard/project/rgjqnymjwiuhsrqrswzz/sql/new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline px-2 py-1 font-medium"
              >
                <span>Abrir Supabase</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
