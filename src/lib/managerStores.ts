import { supabase } from "@/integrations/supabase/client";
import { validateEmail } from "@/lib/emailValidation";

export interface StoreManagerInfo {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
  source?: "store_managers" | "owner";
}

/**
 * Returns all store IDs managed by a user (via store_managers or stores.created_by)
 */
export async function getManagedStoreIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  try {
    const [{ data: mgrRows, error: mgrErr }, { data: ownedRows, error: ownedErr }] = await Promise.all([
      supabase.from("store_managers").select("store_id").eq("user_id", userId),
      supabase.from("stores").select("id").eq("created_by", userId),
    ]);

    const ids = new Set<string>();
    if (!mgrErr && mgrRows) {
      mgrRows.forEach((r: any) => {
        if (r.store_id) ids.add(r.store_id);
      });
    }
    if (!ownedErr && ownedRows) {
      ownedRows.forEach((s: any) => {
        if (s.id) ids.add(s.id);
      });
    }
    return Array.from(ids);
  } catch (err) {
    console.error("Erro a obter lojas do gestor:", err);
    return [];
  }
}

/**
 * Lists managers for a specific store.
 * Tries Edge Function first, then falls back to store_managers + store.created_by.
 */
export async function listStoreManagers(storeId: string): Promise<StoreManagerInfo[]> {
  // 1. Try Edge Function if deployed
  try {
    const { data, error } = await supabase.functions.invoke("assign-store-manager", {
      body: { action: "list", store_id: storeId },
    });
    if (!error && Array.isArray(data?.managers) && data.managers.length > 0) {
      return data.managers;
    }
  } catch {
    // Edge function not deployed or network error; fall back gracefully
  }

  // 2. Direct database query
  const managers: StoreManagerInfo[] = [];
  try {
    // Check store_managers table
    const { data: rows } = await supabase
      .from("store_managers")
      .select("id, user_id, created_at")
      .eq("store_id", storeId);

    if (rows && rows.length > 0) {
      rows.forEach((r: any) => {
        managers.push({
          id: r.id,
          user_id: r.user_id,
          email: "Gestor (" + r.user_id.slice(0, 8) + "...)",
          created_at: r.created_at,
          source: "store_managers",
        });
      });
    }

    // Check store created_by (owner)
    const { data: store } = await supabase
      .from("stores")
      .select("id, created_by, created_at")
      .eq("id", storeId)
      .maybeSingle();

    if (store?.created_by) {
      const alreadyListed = managers.some((m) => m.user_id === store.created_by);
      if (!alreadyListed) {
        const cachedEmail = localStorage.getItem(`mgr_email_${store.created_by}`);
        managers.push({
          id: store.created_by,
          user_id: store.created_by,
          email: cachedEmail || "Proprietário da loja",
          created_at: store.created_at || new Date().toISOString(),
          source: "owner",
        });
      }
    }
  } catch (err) {
    console.warn("Erro a listar gestores via DB:", err);
  }

  return managers;
}

export interface AssignResult {
  ok: boolean;
  user_id?: string;
  created: boolean;
  tempPassword?: string;
  email: string;
  recovery_link?: string | null;
  rlsRequired?: boolean;
}

/**
 * Assigns or creates a store manager.
 * Tries Edge Function first, then robust client-side flow.
 */
export async function assignStoreManager(
  storeId: string,
  email: string,
  customPassword?: string
): Promise<AssignResult> {
  const val = validateEmail(email);
  if (!val.isValid) {
    throw new Error(val.error || "Endereço de email inválido.");
  }
  const cleanEmail = val.normalizedEmail;
  const password = customPassword || "Gestor" + Math.floor(1000 + Math.random() * 9000) + "!";

  // 1. Prioridade Máxima: RPC Atómica de Base de Dados (já cria/ativa com email confirmado e senha direta)
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("create_or_assign_manager" as any, {
      _store_id: storeId,
      _email: cleanEmail,
      _password: password,
    });

    if (!rpcErr && rpcData && (rpcData as any).ok) {
      const res = rpcData as any;
      if (res.user_id) {
        try {
          localStorage.setItem(`mgr_email_${res.user_id}`, cleanEmail);
        } catch { /* ignore */ }
      }
      return {
        ok: true,
        user_id: res.user_id,
        created: !!res.created,
        tempPassword: res.password || password,
        email: cleanEmail,
      };
    }
  } catch (e) {
    console.warn("RPC create_or_assign_manager não disponível, a tentar métodos secundários:", e);
  }

  // 1.1 Tentar RPC set_or_create_user_password + associação à loja
  try {
    const { data: pwdData, error: pwdErr } = await (supabase.rpc as any)("set_or_create_user_password", {
      p_email: cleanEmail,
      p_password: password,
    });

    if (!pwdErr && pwdData && (pwdData as any).ok) {
      const uId = (pwdData as any).user_id;
      if (uId) {
        try {
          localStorage.setItem(`mgr_email_${uId}`, cleanEmail);
          await supabase.from("store_managers").insert({ store_id: storeId, user_id: uId });
        } catch { /* ignore */ }
        return {
          ok: true,
          user_id: uId,
          created: !!(pwdData as any).created,
          tempPassword: password,
          email: cleanEmail,
        };
      }
    }
  } catch (e) {
    console.warn("RPC set_or_create_user_password não disponível:", e);
  }

  // 2. Tentar Edge function
  try {
    const { data, error } = await supabase.functions.invoke("assign-store-manager", {
      body: {
        action: "add",
        email: cleanEmail,
        store_id: storeId,
        redirect_to: `${window.location.origin}/reset-password`,
      },
    });
    if (!error && data?.ok) {
      return {
        ok: true,
        user_id: data.user_id,
        created: !!data.created,
        email: cleanEmail,
        tempPassword: password,
        recovery_link: data.recovery_link ?? null,
      };
    }
  } catch {
    // Edge function indisponível
  }

  // 3. Fallback Direto no Cliente: Sign up se novo e associação direta
  let created = false;
  let targetUserId: string | null = null;

  try {
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
    });

    if (signUpData?.user) {
      targetUserId = signUpData.user.id;
      created = true;
    } else if (signUpErr) {
      console.log("Informação no signup:", signUpErr.message);
    }
  } catch (e) {
    console.warn("Registo de conta:", e);
  }

  if (targetUserId) {
    try {
      localStorage.setItem(`mgr_email_${targetUserId}`, cleanEmail);
    } catch { /* ignore */ }
  }

  // 4. Associar gestor à loja
  let rlsNotice = false;
  if (targetUserId) {
    try {
      const { error: insErr } = await supabase
        .from("store_managers")
        .insert({ store_id: storeId, user_id: targetUserId });
      if (insErr) {
        if (insErr.message?.toLowerCase().includes("row-level security") || insErr.code === "42501") {
          rlsNotice = true;
        }
      }
    } catch {
      rlsNotice = true;
    }
  }

  // Nota: Não enviamos redefinição de palavra-passe automática para evitar devoluções (bounces)
  // e porque as credenciais já são fornecidas diretamente ao administrador no painel.

  return {
    ok: true,
    user_id: targetUserId ?? undefined,
    created,
    tempPassword: password,
    email: cleanEmail,
    rlsRequired: rlsNotice,
  };
}

/**
 * Atualiza a palavra-passe de um gestor diretamente na base de dados (sem emails).
 */
export async function updateManagerPassword(
  storeId: string,
  email: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const val = validateEmail(email);
  if (!val.isValid) {
    return { ok: false, error: val.error };
  }
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: "A palavra-passe deve ter pelo menos 6 caracteres." };
  }

  // 1. Tentar RPC create_or_assign_manager
  try {
    const { data, error } = await supabase.rpc("create_or_assign_manager" as any, {
      _store_id: storeId,
      _email: val.normalizedEmail,
      _password: newPassword,
    });
    if (!error && data && (data as any).ok) {
      return { ok: true };
    }
  } catch {
    // Continuar para próxima tentativa
  }

  // 2. Tentar RPC set_or_create_user_password
  try {
    const { data, error } = await supabase.rpc("set_or_create_user_password" as any, {
      p_email: val.normalizedEmail,
      p_password: newPassword,
    });
    if (!error && data && (data as any).ok) {
      return { ok: true };
    }
  } catch {
    // Continuar para Edge Function
  }

  // 2. Tentar Edge function
  try {
    const { data, error } = await supabase.functions.invoke("assign-store-manager", {
      body: {
        action: "set_password",
        email: val.normalizedEmail,
        store_id: storeId,
        password: newPassword,
      },
    });
    if (!error && data?.ok) {
      return { ok: true };
    }
    if (error) {
      return { ok: false, error: error.message };
    }
    if (data?.error) {
      return { ok: false, error: data.error };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  return { ok: false, error: "Não foi possível atualizar a palavra-passe. Verifique se executou o script SQL no Supabase." };
}

/**
 * Removes a manager from a store.
 */
export async function removeStoreManager(
  storeId: string,
  manager: StoreManagerInfo
): Promise<void> {
  // 1. Try Edge function
  try {
    const { data, error } = await supabase.functions.invoke("assign-store-manager", {
      body: { action: "remove", email: manager.email, store_id: storeId },
    });
    if (!error && data?.ok) return;
  } catch {
    // Fall back to direct DB
  }

  // 2. Direct removal from store_managers
  try {
    if (manager.source === "store_managers" || manager.user_id) {
      await supabase
        .from("store_managers")
        .delete()
        .eq("store_id", storeId)
        .eq("user_id", manager.user_id);
    }
  } catch (err) {
    console.error("Erro ao remover gestor:", err);
    throw err;
  }
}
