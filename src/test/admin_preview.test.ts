import { describe, it, expect } from "vitest";
import { isOwnerAdminEmail, OWNER_ADMIN_EMAILS } from "@/contexts/AuthContext";

describe("Admin Authentication & Preview Verification", () => {
  it("recognizes all founder and admin variants of g.traquino66@gmail.com", () => {
    expect(isOwnerAdminEmail("g.traquino66@gmail.com")).toBe(true);
    expect(isOwnerAdminEmail("gtraquino66@gmail.com")).toBe(true);
    expect(isOwnerAdminEmail("G.TRAQUINO66@GMAIL.COM")).toBe(true);
    expect(isOwnerAdminEmail("giltraquino@gmail.com")).toBe(true);
    expect(isOwnerAdminEmail("gil.traquino@gmail.com")).toBe(true);
    expect(isOwnerAdminEmail("giltraquinocomercial@gmail.com")).toBe(true);
  });

  it("denies access to non-admin emails", () => {
    expect(isOwnerAdminEmail("cliente@gmail.com")).toBe(false);
    expect(isOwnerAdminEmail("loja.gestor@gmail.com")).toBe(false);
    expect(isOwnerAdminEmail("")).toBe(false);
    expect(isOwnerAdminEmail(null)).toBe(false);
    expect(isOwnerAdminEmail(undefined)).toBe(false);
  });

  it("contains the primary admin email in OWNER_ADMIN_EMAILS", () => {
    expect(OWNER_ADMIN_EMAILS).toContain("g.traquino66@gmail.com");
  });
});
