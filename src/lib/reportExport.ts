import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";

export interface OrderItem {
  id?: string;
  name: string;
  price: number;
  qty: number;
}

export interface OrderRecord {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  total: number;
  currency: string;
}

interface ReportMeta {
  storeName: string;
  dateLabel: string;
  currency: string;
  nif?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  whatsapp2?: string | null;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
};

const itemsToText = (items: OrderItem[]) =>
  items.map((i) => `${i.name} x${i.qty} (${Number(i.price).toFixed(2)})`).join("; ");

export function exportOrdersPDF(orders: OrderRecord[], meta: ReportMeta) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Relatório de Pedidos — ${meta.storeName}`, 14, 18);
  doc.setFontSize(11);
  doc.text(`Data: ${meta.dateLabel}`, 14, 26);
  doc.text(`Total de pedidos: ${orders.length}`, 14, 32);

  const grandTotal = orders.reduce((s, o) => s + Number(o.total), 0);
  doc.text(`Total faturado: ${grandTotal.toFixed(2)} ${meta.currency}`, 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [["Hora", "Cliente", "Contacto", "Itens", "Total"]],
    body: orders.map((o) => [
      fmtTime(o.created_at),
      o.customer_name,
      o.customer_phone,
      itemsToText(o.items),
      `${Number(o.total).toFixed(2)} ${o.currency}`,
    ]),
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 3: { cellWidth: 70 } },
  });

  doc.save(`pedidos-${meta.storeName}-${meta.dateLabel}.pdf`);
}

export function exportInvoicePDF(order: OrderRecord, meta: ReportMeta) {
  const doc = new jsPDF();
  const invoiceNo = order.id.slice(0, 8).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleString("pt-PT");

  // Cabeçalho com dados da loja
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(meta.storeName, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 24;
  if (meta.nif) { doc.text(`NIF: ${meta.nif}`, 14, y); y += 5; }
  if (meta.address) { doc.text(meta.address, 14, y); y += 5; }
  const contacts = [meta.whatsapp, meta.whatsapp2].filter(Boolean).join(" / ");
  if (contacts) { doc.text(`Tel: ${contacts}`, 14, y); y += 5; }

  // Bloco direito: nº e data
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("TALÃO / FACTURA", 196, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nº ${invoiceNo}`, 196, 24, { align: "right" });
  doc.text(`Data: ${dateStr}`, 196, 29, { align: "right" });

  const clientY = Math.max(y, 36) + 4;
  doc.setDrawColor(200);
  doc.line(14, clientY - 2, 196, clientY - 2);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", 14, clientY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(`Nome: ${order.customer_name || "—"}`, 14, clientY + 10);
  doc.text(`Contacto: ${order.customer_phone || "—"}`, 14, clientY + 16);

  autoTable(doc, {
    startY: clientY + 22,
    head: [["Produto", "Qtd", "Preço Unit.", "Subtotal"]],
    body: order.items.map((i) => [
      i.name,
      String(i.qty),
      `${Number(i.price).toFixed(2)} ${order.currency}`,
      `${(Number(i.price) * Number(i.qty)).toFixed(2)} ${order.currency}`,
    ]),
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [40, 40, 40] },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 60;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${Number(order.total).toFixed(2)} ${order.currency}`, 196, finalY + 10, { align: "right" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Obrigado pela sua preferência.", 14, finalY + 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Documento emitido eletronicamente — sem valor fiscal salvo indicação contrária.", 14, finalY + 30);

  doc.save(`talao-${invoiceNo}.pdf`);
}

export async function exportInvoiceDOCX(order: OrderRecord, meta: ReportMeta) {
  const invoiceNo = order.id.slice(0, 8).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleString("pt-PT");

  const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  const headerCells = ["Produto", "Qtd", "Preço", "Subtotal"].map((h) =>
    new TableCell({
      borders: cellBorders,
      shading: { fill: "EEEEEE", type: "clear" as any },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })
  );

  const bodyRows = order.items.map(
    (i) =>
      new TableRow({
        children: [
          i.name,
          String(i.qty),
          `${Number(i.price).toFixed(2)} ${order.currency}`,
          `${(Number(i.price) * Number(i.qty)).toFixed(2)} ${order.currency}`,
        ].map(
          (val) =>
            new TableCell({
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun(val)] })],
            })
        ),
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } },
        },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: meta.storeName, bold: true })] }),
          ...(meta.nif ? [new Paragraph({ children: [new TextRun(`NIF: ${meta.nif}`)] })] : []),
          ...(meta.address ? [new Paragraph({ children: [new TextRun(meta.address)] })] : []),
          ...(meta.whatsapp || meta.whatsapp2
            ? [new Paragraph({ children: [new TextRun(`Tel: ${[meta.whatsapp, meta.whatsapp2].filter(Boolean).join(" / ")}`)] })]
            : []),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "TALÃO / FACTURA", bold: true, size: 28 })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`Nº ${invoiceNo}`)] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`Data: ${dateStr}`)] }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ children: [new TextRun({ text: "Cliente: ", bold: true }), new TextRun(order.customer_name || "—")] }),
          new Paragraph({ children: [new TextRun({ text: "Contacto: ", bold: true }), new TextRun(order.customer_phone || "—")] }),
          new Paragraph({ children: [new TextRun("")] }),
          new Table({
            width: { size: 10240, type: WidthType.DXA },
            columnWidths: [4540, 1500, 2100, 2100],
            rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `TOTAL: ${Number(order.total).toFixed(2)} ${order.currency}`, bold: true, size: 28 })],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ children: [new TextRun({ text: "Obrigado pela sua preferência.", italics: true })] }),
          new Paragraph({ children: [new TextRun({ text: "Documento emitido eletronicamente — sem valor fiscal salvo indicação contrária.", italics: true, size: 16 })] }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `talao-${invoiceNo}.docx`);
}

export async function exportOrdersDOCX(orders: OrderRecord[], meta: ReportMeta) {
  const grandTotal = orders.reduce((s, o) => s + Number(o.total), 0);

  const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  const headerCells = ["Hora", "Cliente", "Contacto", "Itens", "Total"].map((h) =>
    new TableCell({
      borders: cellBorders,
      shading: { fill: "EEEEEE", type: "clear" as any },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })
  );

  const bodyRows = orders.map(
    (o) =>
      new TableRow({
        children: [
          fmtTime(o.created_at),
          o.customer_name,
          o.customer_phone,
          itemsToText(o.items),
          `${Number(o.total).toFixed(2)} ${o.currency}`,
        ].map(
          (val) =>
            new TableCell({
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun(val)] })],
            })
        ),
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun(`Relatório de Pedidos — ${meta.storeName}`)],
          }),
          new Paragraph({ children: [new TextRun(`Data: ${meta.dateLabel}`)] }),
          new Paragraph({ children: [new TextRun(`Total de pedidos: ${orders.length}`)] }),
          new Paragraph({
            children: [new TextRun({ text: `Total faturado: ${grandTotal.toFixed(2)} ${meta.currency}`, bold: true })],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Table({
            width: { size: 10240, type: WidthType.DXA },
            columnWidths: [1200, 2200, 1800, 3540, 1500],
            rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `pedidos-${meta.storeName}-${meta.dateLabel}.docx`);
}
