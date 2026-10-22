import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DOC_TYPE_LABELS,
  formatFiscalNumber,
  InvoiceRow,
  InvoiceItemRow,
} from "./fiscalRules";

export interface FiscalStoreMeta {
  name: string;
  nif?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  whatsapp_2?: string | null;
}

const kz = (n: unknown) =>
  `${Number(n || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;

/**
 * PDF fiscal A4 com elementos regulamentares:
 * espaço reservado ao QR Code de validação AGT, identificadores fiscais
 * e menção legal de isenção quando aplicável.
 */
export function exportFiscalDocPDF(
  doc: InvoiceRow,
  items: InvoiceItemRow[],
  store: FiscalStoreMeta,
  originalRef?: string
) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();

  // Cabeçalho do emitente
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(store.name || "Emitente", 14, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  let y = 24;
  if (store.nif) {
    pdf.text(`NIF: ${store.nif}`, 14, y);
    y += 5;
  }
  if (store.address) {
    const addrLines = pdf.splitTextToSize(store.address, 110);
    pdf.text(addrLines, 14, y);
    y += addrLines.length * 4.5;
  }
  const contacts = [store.whatsapp, store.whatsapp_2].filter(Boolean).join(" / ");
  if (contacts) {
    pdf.text(`Contactos: ${contacts}`, 14, y);
    y += 5;
  }

  // Espaço reservado ao QR Code de validação fiscal (AGT)
  const qrSize = 34;
  const qrX = pageW - 14 - qrSize;
  const qrY = 12;
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.4);
  pdf.setLineDashPattern([1.5, 1.5], 0);
  pdf.rect(qrX, qrY, qrSize, qrSize);
  pdf.setLineDashPattern([], 0);
  pdf.setFontSize(7);
  pdf.setTextColor(120);
  pdf.text(
    "Espaço reservado para\nQR Code de validação\n(AGT)",
    qrX + qrSize / 2,
    qrY + qrSize / 2 - 2,
    { align: "center" }
  );
  pdf.setTextColor(0);

  // Título do documento
  const titleY = Math.max(y + 6, qrY + qrSize + 8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(
    `${DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} — ${formatFiscalNumber(doc.series, doc.number)}`,
    14,
    titleY
  );
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  let infoY = titleY + 7;
  pdf.text(`Data de emissão: ${doc.issue_date}`, 14, infoY);
  infoY += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text("Cliente:", 14, infoY);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    ` ${doc.customer_name}${doc.customer_nif ? `   •   NIF: ${doc.customer_nif}` : ""}`,
    26,
    infoY
  );
  infoY += 5;
  if (doc.customer_address) {
    const cl = pdf.splitTextToSize(doc.customer_address, 120);
    pdf.text(cl, 26, infoY);
    infoY += cl.length * 4.5;
  }
  if (doc.doc_type === "NC" && doc.reason) {
    const rl = pdf.splitTextToSize(`Motivo da rectificação: ${doc.reason}`, 180);
    pdf.text(rl, 14, infoY + 1);
    infoY += rl.length * 4.5 + 1;
  }
  if (originalRef) {
    pdf.text(`Documento original: ${originalRef}`, 14, infoY + 1);
    infoY += 6;
  }
  if (doc.notes) {
    const nl = pdf.splitTextToSize(`Observações: ${doc.notes}`, 180);
    pdf.text(nl, 14, infoY + 1);
    infoY += nl.length * 4.5 + 1;
  }

  // Tabela de linhas
  autoTable(pdf, {
    startY: infoY + 4,
    head: [["Descrição", "Qtd", "Preço Unit.", "Subtotal", `IVA ${Number(doc.iva_rate)}%`, "Total"]],
    body: items.map((it) => [
      it.description,
      String(Number(it.quantity)),
      kz(it.unit_price),
      kz(it.line_subtotal),
      kz(it.iva_amount),
      kz(it.line_total),
    ]),
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 30, 30] },
    columnStyles: { 0: { cellWidth: 62 } },
  });

  // Totais
  const endY = ((pdf as any).lastAutoTable?.finalY ?? infoY + 30) + 8;
  const tx = pageW - 84;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text("Subtotal:", tx, endY);
  pdf.text(kz(doc.subtotal), pageW - 14, endY, { align: "right" });
  pdf.text(`IVA (${Number(doc.iva_rate)}%):`, tx, endY + 6);
  pdf.text(kz(doc.iva_amount), pageW - 14, endY + 6, { align: "right" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("TOTAL:", tx, endY + 14);
  pdf.text(kz(doc.total), pageW - 14, endY + 14, { align: "right" });

  // Menção legal de isenção
  if (Number(doc.iva_rate) === 0) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    pdf.text("Isenção: Isento ao abrigo do nº 1 do Artigo 12.º do Código do IVA.", 14, endY + 14);
  }

  // Rodapé regulamentar
  const footerY = pdf.internal.pageSize.getHeight() - 20;
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.3);
  pdf.line(14, footerY - 4, pageW - 14, footerY - 4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Processado por computador", 14, footerY);
  pdf.text(
    `Documento ${formatFiscalNumber(doc.series, doc.number)}${doc.status === "rectified" ? " (RECTIFICADO)" : ""} — Emitido em conformidade com a legislação da AGT`,
    14,
    footerY + 4
  );
  pdf.text(
    `NIF emitente: ${store.nif || "—"}   •   NIF cliente: ${doc.customer_nif || "Consumidor final"}`,
    14,
    footerY + 8
  );

  pdf.save(`${doc.series.replace(" ", "_")}_${doc.number}.pdf`);
}
