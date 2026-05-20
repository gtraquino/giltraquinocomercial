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
