export type ActivityOrder = { id: string; store_id: string; total: number; currency: string; created_at: string; customer_name: string };
export type ActivityProduct = { store_id: string; in_stock: boolean };

export function summarizeActivity(orders: ActivityOrder[], products: ActivityProduct[], storeIds: string[]) {
  const ids = new Set(storeIds);
  const scopedOrders = orders.filter(order => ids.has(order.store_id));
  const scopedProducts = products.filter(product => ids.has(product.store_id));
  const values: Record<string, number> = {};
  for (const order of scopedOrders) values[order.currency] = (values[order.currency] ?? 0) + Number(order.total);
  return { orders: scopedOrders.length, products: scopedProducts.length, unavailable: scopedProducts.filter(product => !product.in_stock).length, values };
}