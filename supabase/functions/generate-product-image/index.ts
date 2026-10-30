import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODEL = "openai/gpt-image-2.5-sunburst";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);
    const URL_ = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Serviço de IA não configurado" }, 500);

    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Sessão inválida" }, 401);

    const { product_id } = await req.json().catch(() => ({}));
    if (!product_id || typeof product_id !== "string") return json({ error: "Produto em falta" }, 400);

    const admin = createClient(URL_, SERVICE);
    const { data: product } = await admin.from("products")
      .select("id, name, description, category, store_id").eq("id", product_id).maybeSingle();
    if (!product) return json({ error: "Produto não encontrado" }, 404);

    const [{ data: isAdmin }, { data: isMgr }] = await Promise.all([
      admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" }),
      admin.rpc("is_store_manager", { _user_id: u.user.id, _store_id: product.store_id }),
    ]);
    if (!isAdmin && !isMgr) return json({ error: "Sem permissão para esta loja" }, 403);

    const { data: store } = await admin.from("stores")
      .select("name, type, primary_color, accent_color").eq("id", product.store_id).maybeSingle();

    const desc = String(product.description ?? "").replace(/\[STOCK:\d+\]/g, "").trim().slice(0, 300);
    const prompt = [
      `Fotografia profissional de produto para catálogo: "${product.name}".`,
      desc && `Detalhes: ${desc}.`,
      product.category && `Categoria: ${product.category}.`,
      store?.type && `Tipo de negócio: ${store.type}.`,
      `Fundo limpo e suave em tons inspirados nas cores da marca${store?.primary_color ? ` (${store.primary_color}` : ""}${store?.accent_color ? `, ${store.accent_color})` : store?.primary_color ? ")" : ""}.`,
      "Produto centrado, iluminação de estúdio suave, foco nítido, sem texto, sem logótipos, sem marcas de água, enquadramento quadrado.",
    ].filter(Boolean).join(" ");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024" }),
    });
    if (!res.ok) {
      const t = await res.text();
      let msg = "Falha ao gerar imagem.";
      try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? msg; } catch { /* */ }
      if (res.status === 402) msg = "Créditos de IA insuficientes. " + msg;
      if (res.status === 429) msg = "Muitos pedidos, tente daqui a pouco.";
      return json({ error: msg }, res.status);
    }
    const out = await res.json();
    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) return json({ error: "A IA não devolveu imagem." }, 502);

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${product.store_id}/products/ai-${product.id}-${Date.now()}.png`;
    const { error: upErr } = await admin.storage.from("store-assets").upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);
    const { data: pub } = admin.storage.from("store-assets").getPublicUrl(path);

    const { error: updErr } = await admin.from("products").update({ image_url: pub.publicUrl }).eq("id", product.id);
    if (updErr) return json({ error: updErr.message }, 500);
    return json({ ok: true, image_url: pub.publicUrl });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro" }, 500);
  }
});
