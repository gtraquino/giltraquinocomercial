import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return json({ error: "Configuração do servidor incompleta" }, 500);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr) return json({ error: "Erro a verificar permissão: " + roleErr.message }, 500);
    if (!isAdmin) return json({ error: "Apenas admin" }, 403);

    const body = await req.json().catch(() => ({}));
    const { email, store_id, action, redirect_to } = body as {
      email?: string;
      store_id?: string;
      action?: "add" | "remove" | "list";
      redirect_to?: string;
    };

    if (!store_id || !action) return json({ error: "Parâmetros em falta" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === "list") {
      const { data: managers, error } = await admin
        .from("store_managers")
        .select("id, user_id, created_at")
        .eq("store_id", store_id);
      if (error) return json({ error: error.message }, 500);
      const enriched = await Promise.all(
        (managers ?? []).map(async (m: any) => {
          try {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            return { ...m, email: u?.user?.email ?? "—" };
          } catch {
            return { ...m, email: "—" };
          }
        }),
      );
      return json({ managers: enriched });
    }

    if (!email || typeof email !== "string") {
      return json({ error: "Email obrigatório" }, 400);
    }

    const cleanEmail = email.trim().toLowerCase();

    // Look up existing user
    const { data: existingId, error: lookupErr } = await admin.rpc(
      "get_user_id_by_email",
      { _email: cleanEmail },
    );
    if (lookupErr) return json({ error: "Erro a procurar utilizador: " + lookupErr.message }, 500);

    if (action === "remove") {
      if (!existingId) return json({ error: "Utilizador não encontrado" }, 404);
      const { error } = await admin
        .from("store_managers")
        .delete()
        .eq("store_id", store_id)
        .eq("user_id", existingId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // action === "add": create user if needed, then associate
    let targetUserId = existingId as string | null;
    let created = false;

    if (!targetUserId) {
      // Generate a strong random temp password — manager will set their own via the recovery link
      const tempPassword =
        crypto.randomUUID().replace(/-/g, "") + "Aa1!";
      const { data: createData, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
      });
      if (createErr || !createData?.user) {
        return json({ error: "Erro a criar utilizador: " + (createErr?.message ?? "desconhecido") }, 500);
      }
      targetUserId = createData.user.id;
      created = true;
    }

    const { error: insertErr } = await admin
      .from("store_managers")
      .insert({ store_id, user_id: targetUserId });
    if (insertErr && !insertErr.message.toLowerCase().includes("duplicate")) {
      return json({ error: insertErr.message }, 500);
    }

    // Generate a recovery link so the manager can set their own password
    let recoveryLink: string | null = null;
    try {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: cleanEmail,
        options: { redirectTo: redirect_to || undefined },
      });
      if (!linkErr) recoveryLink = linkData?.properties?.action_link ?? null;
    } catch { /* ignore */ }

    return json({ ok: true, user_id: targetUserId, created, recovery_link: recoveryLink });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro desconhecido" }, 500);
  }
});
