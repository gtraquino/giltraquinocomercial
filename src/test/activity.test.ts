import { describe, expect, it } from "vitest";
import { summarizeActivity } from "../lib/activity";

const orders = [
  { id: "1", store_id: "horta", total: 500, currency: "AOA", created_at: "2026-10-30", customer_name: "Ana" },
  { id: "2", store_id: "outra", total: 800, currency: "AOA", created_at: "2026-10-30", customer_name: "João" },
  { id: "3", store_id: "horta", total: 20, currency: "USD", created_at: "2026-10-30", customer_name: "Rui" },
];
describe("Actividade das lojas", () => {
  it("inclui apenas actividade das lojas seleccionadas", () => {
    expect(summarizeActivity(orders, [{ store_id: "outra", in_stock: false }, { store_id: "horta", in_stock: true }], ["horta"])).toEqual({ orders: 2, products: 1, unavailable: 0, values: { AOA: 500, USD: 20 } });
  });
  it("não soma valores de moedas diferentes", () => {
    expect(summarizeActivity(orders, [], ["horta", "outra"]).values).toEqual({ AOA: 1300, USD: 20 });
  });
});