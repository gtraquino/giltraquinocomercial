export interface ProductStockInfo {
  cleanDescription: string;
  stockQty: number | null; // null means unlimited/no limit
}

/**
 * Parses the product description to extract stock levels.
 * The format in database description field is "Your description [STOCK:15]" or "Your description [STOCK:unlimited]"
 */
export function parseProductDescription(desc: string | null): ProductStockInfo {
  if (!desc) {
    return { cleanDescription: "", stockQty: null };
  }
  // Match pattern [STOCK:value] anywhere in description, usually at the end
  const match = desc.match(/\[STOCK:(-?\d+|unlimited)\]/);
  if (match) {
    const cleanDescription = desc.replace(/\[STOCK:(-?\d+|unlimited)\]/, "").trim();
    const val = match[1];
    const stockQty = val === "unlimited" ? null : parseInt(val, 10);
    return { cleanDescription, stockQty };
  }
  return { cleanDescription: desc, stockQty: null };
}

/**
 * Formats clean description and stock level into a single string to save in the DB description field.
 */
export function formatProductDescription(cleanDescription: string, stockQty: number | null): string {
  const clean = (cleanDescription || "").trim();
  if (stockQty === null) {
    return `${clean} [STOCK:unlimited]`.trim();
  }
  return `${clean} [STOCK:${stockQty}]`.trim();
}
