import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Apenas admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { email, store_id, action } = body as { email?: string; store_id: string; action: "add" | "remove" | "list" };

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === "list") {
      const { data: managers, error } = await admin.from("store_managers").select("id, user_id, created_at").eq("store_id", store_id);
      if (error) throw error;
      // Resolve emails
      const enriched = await Promise.all((managers ?? []).map(async (m: any) => {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id);
        return { ...m, email: u?.user?.email ?? "—" };
      }));
      return new Response(JSON.stringify({ managers: enriched }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find user by email (paginate)
    let targetUserId: string | null = null;
    let page = 1;
    while (!targetUserId && page < 20) {
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) targetUserId = found.id;
      if (list.users.length < 200) break;
      page++;
    }
    if (!targetUserId) return new Response(JSON.stringify({ error: "Utilizador não encontrado. Peça-lhe para criar conta primeiro." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (action === "remove") {
      const { error } = await admin.from("store_managers").delete().eq("store_id", store_id).eq("user_id", targetUserId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // add
    const { error } = await admin.from("store_managers").insert({ store_id, user_id: targetUserId });
    if (error && !error.message.includes("duplicate")) throw error;
    return new Response(JSON.stringify({ ok: true, user_id: targetUserId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
