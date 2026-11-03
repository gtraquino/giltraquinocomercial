import { describe, it, expect, beforeEach, vi } from "vitest";

const { state, supabaseMock } = vi.hoisted(() => {
  const state = {
    adminRole: false,
    managerStoreIds: [] as string[],
    ownedStoreIds: [] as string[],
    allStoreIds: [] as string[],
  };

  const makeQuery = (rowsFor: (filters: Record<string, string>) => unknown[]) => {
    const filters: Record<string, string> = {};
    const query: any = {
      select: () => query,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return query;
      },
      order: () => query,
      then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rowsFor(filters), error: null }).then(onOk, onErr),
    };
    return query;
  };

  const supabaseMock = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "has_role") {
        return { data: state.adminRole && args._role === "admin", error: null };
      }
      return { data: null, error: new Error(`RPC ${fn} não disponível`) };
    },
    from: (table: string) => {
      if (table === "store_managers") {
        return makeQuery(() => state.managerStoreIds.map((store_id) => ({ store_id })));
      }
      if (table === "stores") {
        return makeQuery((filters) =>
          filters.created_by
            ? state.ownedStoreIds.map((id) => ({ id }))
            : state.allStoreIds.map((id) => ({ id })),
        );
      }
      return makeQuery(() => []);
    },
    functions: {
      invoke: async () => ({ data: null, error: new Error("edge function indisponível") }),
    },
  };

  return { state, supabaseMock };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

import { getManagedStoreIds } from "@/lib/managerStores";

describe("Acesso de administrador vem da base de dados", () => {
  beforeEach(() => {
    localStorage.clear();
    state.adminRole = false;
    state.managerStoreIds = [];
    state.ownedStoreIds = [];
    state.allStoreIds = ["s1", "s2", "s3"];
  });

  it("concede todas as lojas quando a base de dados confirma o papel admin", async () => {
    state.adminRole = true;
    const ids = await getManagedStoreIds("u-admin", "g.traquino66@gmail.com");
    expect(ids).toEqual(["s1", "s2", "s3"]);
  });

  it("não concede todas as lojas pelo email do fundador quando a base de dados não dá o papel", async () => {
    state.adminRole = false;
    const ids = await getManagedStoreIds("u-fundador", "g.traquino66@gmail.com");
    expect(ids).toEqual([]);
  });

  it("limita o gestor às lojas onde está associado", async () => {
    state.adminRole = false;
    state.managerStoreIds = ["s2"];
    const ids = await getManagedStoreIds("u-gestor", "gestor@loja.com");
    expect(ids).toEqual(["s2"]);
  });

  it("inclui lojas criadas pelo próprio utilizador", async () => {
    state.adminRole = false;
    state.ownedStoreIds = ["s3"];
    const ids = await getManagedStoreIds("u-dono", "dono@loja.com");
    expect(ids).toEqual(["s3"]);
  });

  it("devolve lista vazia sem utilizador identificado", async () => {
    state.adminRole = true;
    expect(await getManagedStoreIds()).toEqual([]);
  });
});
