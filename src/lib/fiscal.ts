import { supabase } from "@/integrations/supabase/client";
import { getManagedStoreIds } from "@/lib/managerStores";

export * from "./fiscalRules";

export interface StoreFiscalInfo {
  id: string;
  name: string;
  nif: string | null;
  address: string | null;
  whatsapp: string | null;
  whatsapp_2: string | null;
  currency: string;
}

export interface OrderLite {
  id: string;
  customer_name: string;
  customer_phone: string;
  items: { name?: string; price?: number; qty?: number }[];
  total: number;
  currency: string;
  created_at: string;
}

/** Lojas visíveis no painel: admin vê todas, gestor só as suas. */
export async function listStoresForPanel(userId: string, isAdmin: boolean): Promise<StoreFiscalInfo[]> {
  const cols = "id, name, nif, address, whatsapp, whatsapp_2, currency";
  if (isAdmin) {
    const { data, error } = await supabase.from("stores").select(cols).order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as StoreFiscalInfo[];
  }
  const ids = await getManagedStoreIds(userId);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("stores").select(cols).in("id", ids).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreFiscalInfo[];
}

export async function fetchInvoices(storeId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("store_id", storeId)
    .order("issue_date", { ascending: false })
    .order("number", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceRow[];
}

export async function fetchInvoiceItems(invoiceIds: string[]): Promise<InvoiceItemRow[]> {
  if (!invoiceIds.length) return [];
  const { data, error } = await supabase
    .from("invoice_items")
    .select("*")
    .in("invoice_id", invoiceIds)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceItemRow[];
}

export async function fetchCustomers(storeId: string): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("store_id", storeId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerRow[];
}

export async function fetchStoreOrders(storeId: string): Promise<OrderLite[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_name, customer_phone, items, total, currency, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderLite[];
}

export interface CustomerInput {
  storeId: string;
  name: string;
  nif: string;
  address: string;
  phone?: string;
  email?: string;
}

export async function createCustomer(input: CustomerInput): Promise<CustomerRow> {
  const { data, error } = await supabase
    .from("customers")
    .insert({
      store_id: input.storeId,
      name: input.name.trim(),
      nif: input.nif.trim(),
      address: input.address.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as CustomerRow;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<CustomerRow> {
  const { data, error } = await supabase
    .from("customers")
    .update({
      name: input.name.trim(),
      nif: input.nif.trim(),
      address: input.address.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as CustomerRow;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface CreateInvoiceInput {
  storeId: string;
  docType: FiscalDocType;
  customerName: string;
  customerNif?: string;
  customerAddress?: string;
  customerId?: string;
  items: { description: string; quantity: number; unit_price: number }[];
  ivaRate: number;
  notes?: string;
  issueDate: string;
  reason?: string;
  correctedInvoiceId?: string;
  sourceOrderId?: string;
}

export interface CreateInvoiceResult {
  id: string;
  doc_type: FiscalDocType;
  series: string;
  number: number;
  subtotal: number;
  iva_rate: number;
  iva_amount: number;
  total: number;
}

/**
 * Emite um documento fiscal via RPC transacional na base de dados.
 * O backend valida NIF, linhas, motivo da NC e atribui numeração
 * sequencial atómica por série (sem saltos nem duplicações).
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const { data, error } = await supabase.rpc("create_invoice" as never, {
    p_store_id: input.storeId,
    p_doc_type: input.docType,
    p_customer_name: input.customerName,
    p_customer_nif: input.customerNif?.trim() || null,
    p_customer_address: input.customerAddress?.trim() || null,
    p_customer_id: input.customerId || null,
    p_items: input.items,
    p_iva_rate: input.ivaRate,
    p_notes: input.notes?.trim() || null,
    p_issue_date: input.issueDate,
    p_reason: input.reason?.trim() || null,
    p_corrected_invoice_id: input.correctedInvoiceId || null,
    p_source_order_id: input.sourceOrderId || null,
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as CreateInvoiceResult;
}
