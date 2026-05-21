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
      console.error("Missing env", { hasUrl: !!SUPABASE_URL, hasService: !!SERVICE_KEY, hasAnon: !!ANON_KEY });
      return json({ error: "Configuração do servidor incompleta" }, 500);
    }

    // Verify caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("getUser failed", userErr);
      return json({ error: "Sessão inválida" }, 401);
    }

    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr) {
      console.error("has_role error", roleErr);
      return json({ error: "Erro a verificar permissão: " + roleErr.message }, 500);
    }
    if (!isAdmin) return json({ error: "Apenas admin" }, 403);

    const body = await req.json().catch(() => ({}));
    const { email, store_id, action } = body as {
      email?: string;
      store_id?: string;
      action?: "add" | "remove" | "list";
    };

    if (!store_id || !action) return json({ error: "Parâmetros em falta" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === "list") {
      const { data: managers, error } = await admin
        .from("store_managers")
        .select("id, user_id, created_at")
        .eq("store_id", store_id);
      if (error) {
        console.error("list managers error", error);
        return json({ error: error.message }, 500);
      }
      const enriched = await Promise.all(
        (managers ?? []).map(async (m: any) => {
          try {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            return { ...m, email: u?.user?.email ?? "—" };
          } catch (e) {
            console.error("getUserById failed", m.user_id, e);
            return { ...m, email: "—" };
          }
        }),
      );
      return json({ managers: enriched });
    }

    if (!email || typeof email !== "string") {
      return json({ error: "Email obrigatório" }, 400);
    }

    // Find user by email via SECURITY DEFINER RPC (exact match in auth.users)
    const { data: targetUserId, error: lookupErr } = await admin.rpc(
      "get_user_id_by_email",
      { _email: email.trim() },
    );
    if (lookupErr) {
      console.error("get_user_id_by_email error", lookupErr);
      return json({ error: "Erro a procurar utilizador: " + lookupErr.message }, 500);
    }
    if (!targetUserId) {
      return json(
        { error: "Utilizador não encontrado. Peça-lhe para criar conta primeiro em /login." },
        404,
      );
    }

    if (action === "remove") {
      const { error } = await admin
        .from("store_managers")
        .delete()
        .eq("store_id", store_id)
        .eq("user_id", targetUserId);
      if (error) {
        console.error("remove error", error);
        return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    // add
    const { error } = await admin
      .from("store_managers")
      .insert({ store_id, user_id: targetUserId });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      console.error("insert error", error);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, user_id: targetUserId });
  } catch (e) {
    console.error("unhandled", e);
    return json({ error: (e as Error).message ?? "Erro desconhecido" }, 500);
  }
});
