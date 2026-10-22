// Regras fiscais AGT (Angola) — módulo puro (sem dependências de rede/Supabase).

export type FiscalDocType = "FT" | "FR" | "RC" | "NC";

export const DOC_TYPE_LABELS: Record<FiscalDocType, string> = {
  FT: "Factura",
  FR: "Factura-Recibo",
  RC: "Recibo",
  NC: "Nota de Crédito",
};

export const IVA_RATES = [
  { value: 14, label: "14% — Taxa geral" },
  { value: 7, label: "7% — Regime simplificado" },
  { value: 5, label: "5% — Taxa reduzida" },
  { value: 0, label: "0% — Isento (Art. 12.º do CIVA)" },
] as const;

/** NIF angolano: exatamente 9 dígitos numéricos. */
export function validateNIF(nif: string): boolean {
  return /^[0-9]{9}$/.test(nif.trim());
}

export function formatFiscalNumber(series: string, number: number): string {
  return `${series}/${number}`;
}

export function formatKz(value: unknown): string {
  return `${Number(value || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Kz`;
}

export interface InvoiceRow {
  id: string;
  store_id: string;
  doc_type: FiscalDocType;
  series: string;
  number: number;
  status: "emitted" | "rectified";
  customer_id: string | null;
  customer_name: string;
  customer_nif: string | null;
  customer_address: string | null;
  issue_date: string;
  subtotal: number;
  iva_rate: number;
  iva_amount: number;
  total: number;
  currency: string;
  notes: string | null;
  reason: string | null;
  corrected_invoice_id: string | null;
  source_order_id: string | null;
  created_at: string;
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_subtotal: number;
  iva_rate: number;
  iva_amount: number;
  line_total: number;
}

export interface CustomerRow {
  id: string;
  store_id: string;
  name: string;
  nif: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface SaftStoreInfo {
  name: string;
  nif?: string | null;
  address?: string | null;
}

const xmlEsc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const d2 = (n: unknown) => Number(n || 0).toFixed(2);

/**
 * Estrutura SAF-T (AO) simplificada, compatível com o modelo da AGT
 * (AuditFile > Header + SourceDocuments > SalesInvoices > Invoice > Line).
 */
export function buildSaftXml(
  store: SaftStoreInfo,
  invoices: InvoiceRow[],
  items: InvoiceItemRow[],
  fiscalYear: number
): string {
  const yearStr = String(fiscalYear);
  const docs = invoices
    .filter((i) => (i.issue_date || "").startsWith(yearStr))
    .sort((a, b) => (a.issue_date + a.series + a.number).localeCompare(b.issue_date + b.series + b.number));

  const nif = (store.nif || "").replace(/[^0-9]/g, "") || "999999999";

  const linesByInvoice = new Map<string, InvoiceItemRow[]>();
  for (const it of items) {
    const arr = linesByInvoice.get(it.invoice_id) ?? [];
    arr.push(it);
    linesByInvoice.set(it.invoice_id, arr);
  }

  const totalDebit = docs.filter((d) => d.doc_type !== "NC").reduce((s, d) => s + Number(d.total || 0), 0);
  const totalCredit = docs.filter((d) => d.doc_type === "NC").reduce((s, d) => s + Number(d.total || 0), 0);
  const now = new Date().toISOString().slice(0, 19);

  const invoiceXml = docs
    .map((doc) => {
      const isNC = doc.doc_type === "NC";
      const sign = isNC ? -1 : 1;
      const docLines = (linesByInvoice.get(doc.id) ?? [])
        .map(
          (l, idx) => `        <Line>
          <LineNumber>${idx + 1}</LineNumber>
          <ProductDescription>${xmlEsc(l.description)}</ProductDescription>
          <Quantity>${d2(l.quantity)}</Quantity>
          <UnitPrice>${d2(l.unit_price)}</UnitPrice>
          <TaxPointDate>${xmlEsc(doc.issue_date)}</TaxPointDate>
          <TaxPercentage>${d2(l.iva_rate)}</TaxPercentage>
          <TaxAmount>${d2(l.iva_amount)}</TaxAmount>
          <DebitAmount>${isNC ? "0.00" : d2(l.line_total)}</DebitAmount>
          <CreditAmount>${isNC ? d2(l.line_total) : "0.00"}</CreditAmount>
        </Line>`
        )
        .join("\n");
      return `      <Invoice>
        <InvoiceNo>${xmlEsc(formatFiscalNumber(doc.series, doc.number))}</InvoiceNo>
        <InvoiceDate>${xmlEsc(doc.issue_date)}</InvoiceDate>
        <InvoiceType>${xmlEsc(doc.doc_type)}</InvoiceType>
        <CustomerTaxID>${xmlEsc(doc.customer_nif || "999999999")}</CustomerTaxID>
        <CustomerName>${xmlEsc(doc.customer_name)}</CustomerName>
        <DocumentStatus>
          <InvoiceStatus>${doc.status === "rectified" ? "A" : "N"}</InvoiceStatus>
        </DocumentStatus>
        <NetTotal>${d2(sign * Number(doc.subtotal || 0))}</NetTotal>
        <TaxTotal>${d2(sign * Number(doc.iva_amount || 0))}</TaxTotal>
        <GrossTotal>${d2(sign * Number(doc.total || 0))}</GrossTotal>
        <Currency><CurrencyCode>${xmlEsc(doc.currency || "AOA")}</CurrencyCode></Currency>
${docLines}
      </Invoice>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
  <Header>
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${xmlEsc(nif)}</CompanyID>
    <TaxRegistrationNumber>${xmlEsc(nif)}</TaxRegistrationNumber>
    <TaxAccountingBasis>Facturacao</TaxAccountingBasis>
    <CompanyName>${xmlEsc(store.name)}</CompanyName>
    <BusinessName>${xmlEsc(store.name)}</BusinessName>
    <FiscalYear>${fiscalYear}</FiscalYear>
    <StartDate>${yearStr}-01-01</StartDate>
    <EndDate>${yearStr}-12-31</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
    <DateCreated>${now}</DateCreated>
    <ProductCompanyTaxID>${xmlEsc(nif)}</ProductCompanyTaxID>
    <SoftwareValidationNumber></SoftwareValidationNumber>
    <ProductID>comercial.giltraquino/GT</ProductID>
    <ProductVersion>1.0.0</ProductVersion>
  </Header>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${docs.length}</NumberOfEntries>
      <TotalDebit>${d2(totalDebit)}</TotalDebit>
      <TotalCredit>${d2(totalCredit)}</TotalCredit>
${invoiceXml}
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>`;
}
