import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Cross-tenant checks run as an anonymous visitor against the real backend.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const run = url && key ? describe : describe.skip;

run("isolamento entre lojas (visitante anónimo)", () => {
  const anon = createClient(url, key, { auth: { persistSession: false } });

  it("não lê pedidos de nenhuma loja", async () => {
    const { data } = await anon.from("orders").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });
  it("não lê documentos fiscais", async () => {
    const { data } = await anon.from("invoices").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });
  it("não lê clientes", async () => {
    const { data } = await anon.from("customers").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });
  it("não lê associações de gestores", async () => {
    const { data } = await anon.from("store_managers").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });
  it("não consome quota de IA", async () => {
    const { error } = await anon.rpc("consume_ai_quota", { _kind: "image" });
    expect(error).not.toBeNull();
  });
  it("não altera produtos", async () => {
    const { data } = await anon.from("products").update({ name: "x" }).neq("id", "00000000-0000-0000-0000-000000000000").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
