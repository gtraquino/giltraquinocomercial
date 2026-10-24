import { describe, it, expect } from "vitest";
import { validateNIF, buildSaftXml, formatFiscalNumber } from "@/lib/fiscalRules";

describe("AGT fiscal rules", () => {
  it("accepts a 9-digit Angolan NIF", () => {
    expect(validateNIF("541700000")).toBe(true);
  });
  it("rejects NIFs that are not exactly 9 digits", () => {
    expect(validateNIF("5417000000")).toBe(false);
    expect(validateNIF("54170000")).toBe(false);
    expect(validateNIF("54170000A")).toBe(false);
  });
  it("formats sequential numbers per series", () => {
    expect(formatFiscalNumber("FT 2026", 2)).toBe("FT 2026/2");
  });
  it("SAF-T counts credit notes as credit", () => {
    const base = { store_id: "s", status: "emitted", customer_id: null, customer_nif: null, customer_address: null, issue_date: "2026-03-01", subtotal: 100, iva_rate: 14, iva_amount: 14, currency: "AOA", notes: null, reason: null, corrected_invoice_id: null, source_order_id: null, created_at: "" } as const;
    const xml = buildSaftXml({ name: "Loja", nif: "541700000" }, [
      { ...base, id: "1", doc_type: "FT", series: "FT 2026", number: 1, customer_name: "A", total: 114 },
      { ...base, id: "2", doc_type: "NC", series: "NC 2026", number: 1, customer_name: "A", total: 114, reason: "erro" },
    ] as any, [], 2026);
    expect(xml).toContain("<TotalDebit>114.00</TotalDebit>");
    expect(xml).toContain("<TotalCredit>114.00</TotalCredit>");
  });
});
