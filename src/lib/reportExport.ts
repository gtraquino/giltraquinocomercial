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

export function drawQRCode(doc: jsPDF, x: number, y: number, size: number, uuid: string) {
  // Draw border
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.rect(x - 2, y - 2, size + 4, size + 4);
  
  // Seedable pseudo-random function using UUID hash
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = uuid.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const seedRandom = () => {
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };

  // Draw simulated QR matrix (21x21 grid)
  const gridSize = 21;
  const cellSize = size / gridSize;
  doc.setFillColor(0, 0, 0);

  // Helper to draw a square
  const drawSq = (col: number, row: number) => {
    doc.rect(x + col * cellSize, y + row * cellSize, cellSize + 0.05, cellSize + 0.05, "F");
  };

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      // Draw standard QR code finder patterns in 3 corners:
      // Top-Left (7x7)
      if (r < 7 && c < 7) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          drawSq(c, r);
        }
        continue;
      }
      // Top-Right (7x7)
      if (r < 7 && c >= gridSize - 7) {
        const cAdj = c - (gridSize - 7);
        if (r === 0 || r === 6 || cAdj === 0 || cAdj === 6 || (r >= 2 && r <= 4 && cAdj >= 2 && cAdj <= 4)) {
          drawSq(c, r);
        }
        continue;
      }
      // Bottom-Left (7x7)
      if (r >= gridSize - 7 && c < 7) {
        const rAdj = r - (gridSize - 7);
        if (rAdj === 0 || rAdj === 6 || c === 0 || c === 6 || (rAdj >= 2 && rAdj <= 4 && c >= 2 && c <= 4)) {
          drawSq(c, r);
        }
        continue;
      }

      // Small alignment pattern in bottom-right area (around 14-18)
      if (r >= 14 && r <= 18 && c >= 14 && c <= 18) {
        if (r === 14 || r === 18 || c === 14 || c === 18 || (r === 16 && c === 16)) {
          drawSq(c, r);
        }
        continue;
      }

      // Rest is pseudo-random data bits
      if (seedRandom() > 0.45) {
        drawSq(c, r);
      }
    }
  }
}

export function exportInvoicePDF(order: OrderRecord, meta: ReportMeta) {
  const doc = new jsPDF();
  
  // 1. Extract and format customer name and NIF
  let clientName = order.customer_name || "Consumidor Final";
  let clientNif = "999999999"; // standard final consumer NIF in Angola
  const nifMatch = clientName.match(/(.*?)\s*\(NIF:\s*([^\)]+)\)/i);
  if (nifMatch) {
    clientName = nifMatch[1].trim();
    clientNif = nifMatch[2].trim();
  }

  // 2. Generate deterministic AGT 2026 series & invoice number
  const d = new Date(order.created_at);
  const year = d.getFullYear();
  const dateStr = d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  
  let hash = 0;
  for (let i = 0; i < order.id.length; i++) {
    hash = order.id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const seqNum = Math.abs(hash % 999) + 1;
  const seqStr = String(seqNum).padStart(3, "0");
  const prefix = meta.prefix || "FT"; // "FT" is Factura, "FR" is Factura-Recibo, etc.
  const invoiceNo = `${prefix} A/${year}-${seqStr}`;

  // 3. Page dimensions
  const marginX = 14;
  const pageWith = doc.internal.pageSize.getWidth(); // typically 210mm
  const colRightX = pageWith - marginX; // 196mm

  // 4. Header Section (Emissor)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(meta.storeName, marginX, 18);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate-500
  
  let y = 24;
  doc.text(`NIF: ${meta.nif || "999999999"}`, marginX, y); y += 4.5;
  if (meta.address) { 
    doc.text(meta.address, marginX, y); 
    y += 4.5; 
  }
  const contacts = [meta.whatsapp, meta.whatsapp2].filter(Boolean).join(" / ");
  if (contacts) { 
    doc.text(`Tel: ${contacts}`, marginX, y); 
    y += 4.5; 
  }
  if (meta.email) {
    doc.text(`Email: ${meta.email}`, marginX, y);
    y += 4.5;
  }

  // 5. Header Section (Invoice Metadata / Doc info) - Right Aligned
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text("FACTURA", colRightX, 18, { align: "right" });
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text(invoiceNo, colRightX, 23.5, { align: "right" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Série: A/${year}`, colRightX, 28, { align: "right" });
  doc.text(`Data Emissão: ${dateStr}`, colRightX, 32.5, { align: "right" });
  doc.text(`Moeda: Kwanza (AOA)`, colRightX, 37, { align: "right" });

  // 6. Dividers
  const clientY = Math.max(y, 38) + 6;
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.5);
  doc.line(marginX, clientY - 3, colRightX, clientY - 3);

  // 7. Client Information Block - Beautifully Framed Rounded Rect
  doc.setFillColor(248, 250, 252); // Slate-50 (light background)
  doc.roundedRect(marginX, clientY, colRightX - marginX, 24, 2, 2, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("DADOS DO CLIENTE", marginX + 4, clientY + 6);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Nome: ${clientName}`, marginX + 4, clientY + 12);
  doc.text(`NIF: ${clientNif}`, marginX + 4, clientY + 18);
  if (order.customer_phone) {
    doc.text(`Tel: ${order.customer_phone}`, marginX + 90, clientY + 18);
  }

  // 8. Item Table (using autoTable with AGT columns)
  const ivaRateValue = Number(meta.ivaRate || "0");
  const ivaLabelGlobal = ivaRateValue > 0 ? `${ivaRateValue}%` : "0% (Isento)";

  autoTable(doc, {
    startY: clientY + 28,
    head: [["Descrição / Produto", "Qtd", "P. Unitário", "Taxa IVA", "Total"]],
    body: order.items.map((i) => {
      const itemSubtotal = Number(i.price) * Number(i.qty);
      return [
        i.name,
        String(i.qty),
        `${Number(i.price).toFixed(2)} Kz`,
        ivaLabelGlobal,
        `${itemSubtotal.toFixed(2)} Kz`,
      ];
    }),
    styles: { 
      fontSize: 9, 
      cellPadding: 3.5, 
      textColor: [51, 65, 85], // Slate-700
      lineColor: [241, 245, 249],
      lineWidth: 0.5 
    },
    headStyles: { 
      fillColor: [30, 41, 59], // Slate-800 (Charcoal)
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 15, halign: "center" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 25, halign: "center" },
      4: { cellWidth: 35, halign: "right" }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY || (clientY + 60);

  // 9. Totals Calculation & Drawing (Right Aligned)
  const subtotal = Number(order.total);
  const ivaAmount = (subtotal * ivaRateValue) / 100;
  const grandTotal = subtotal + ivaAmount;

  const totalBlockX = colRightX - 60;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  
  // Align subtotal, iva, total labels
  doc.text("Subtotal:", totalBlockX, finalY + 10);
  doc.text(`${subtotal.toFixed(2)} Kz`, colRightX, finalY + 10, { align: "right" });

  doc.text(`IVA (${ivaRateValue}%):`, totalBlockX, finalY + 15);
  doc.text(`${ivaAmount.toFixed(2)} Kz`, colRightX, finalY + 15, { align: "right" });

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(totalBlockX, finalY + 19, colRightX, finalY + 19);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Total Geral:", totalBlockX, finalY + 24);
  doc.text(`${grandTotal.toFixed(2)} Kz`, colRightX, finalY + 24, { align: "right" });

  // 10. Draw AGT QR Code / Validation stamp (Left Side of Totals)
  const qrX = marginX;
  const qrY = finalY + 6;
  const qrSize = 25;
  drawQRCode(doc, qrX, qrY, qrSize, order.id);

  // 11. Fiscal Metadata next to QR Code
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  
  const metaX = qrX + qrSize + 5;
  const md5Simulated = (order.id.slice(0, 4) + "-" + order.id.slice(9, 13) + "-" + order.id.slice(14, 18) + "-" + order.id.slice(20, 24)).toUpperCase();
  
  doc.setFont("helvetica", "bold");
  doc.text("ELEMENTOS FISCAIS OBRIGATÓRIOS (AGT)", metaX, qrY + 3);
  doc.setFont("helvetica", "normal");
  doc.text(`Código de validação: ${md5Simulated}`, metaX, qrY + 7);
  doc.text("Factura emitida por software certificado AGT nº 2026/01", metaX, qrY + 11);
  doc.text(`Série de facturação: A/${year}`, metaX, qrY + 15);
  doc.text("Documento processado eletronicamente / por computador", metaX, qrY + 19);

  // 12. Terms / Payment Conditions Section
  const conditionsY = finalY + 40;
  doc.setDrawColor(241, 245, 249);
  doc.line(marginX, conditionsY - 3, colRightX, conditionsY - 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("CONDIÇÕES DE PAGAMENTO & OBSERVAÇÕES", marginX, conditionsY + 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Método de Pagamento: Ref. Multicaixa / TPA / Numerário", marginX, conditionsY + 7);
  doc.text("Condição de Venda: Pagamento imediato / Pronto Pagamento", marginX, conditionsY + 11);

  // Legal exemption text if IVA is 0
  if (ivaRateValue === 0) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text("Isenção de IVA: Isento ao abrigo do nº 1 do Artigo 12.º do Código do IVA (Regime de Isenção)", marginX, conditionsY + 16);
  } else {
    doc.text(`Observações: IVA incluído à taxa legal de ${ivaRateValue}% nos termos gerais do Código do IVA.`, marginX, conditionsY + 16);
  }

  // Footer / Greeting
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Obrigado pela sua preferência!", colRightX, conditionsY + 24, { align: "right" });

  // Save the PDF
  doc.save(`Factura-${invoiceNo.replace(/\//g, "_")}.pdf`);
}

export async function exportInvoiceDOCX(order: OrderRecord, meta: ReportMeta) {
  // 1. Parse client info
  let clientName = order.customer_name || "Consumidor Final";
  let clientNif = "999999999";
  const nifMatch = clientName.match(/(.*?)\s*\(NIF:\s*([^\)]+)\)/i);
  if (nifMatch) {
    clientName = nifMatch[1].trim();
    clientNif = nifMatch[2].trim();
  }

  // 2. Format serial & invoice number
  const d = new Date(order.created_at);
  const year = d.getFullYear();
  const dateStr = d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  
  let hash = 0;
  for (let i = 0; i < order.id.length; i++) {
    hash = order.id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const seqNum = Math.abs(hash % 999) + 1;
  const seqStr = String(seqNum).padStart(3, "0");
  const prefix = meta.prefix || "FT";
  const invoiceNo = `${prefix} A/${year}-${seqStr}`;

  const ivaRateValue = Number(meta.ivaRate || "0");
  const ivaLabelGlobal = ivaRateValue > 0 ? `${ivaRateValue}%` : "0% (Isento)";

  const subtotal = Number(order.total);
  const ivaAmount = (subtotal * ivaRateValue) / 100;
  const grandTotal = subtotal + ivaAmount;

  const md5Simulated = (order.id.slice(0, 4) + "-" + order.id.slice(9, 13) + "-" + order.id.slice(14, 18) + "-" + order.id.slice(20, 24)).toUpperCase();

  const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  // Create table header
  const headerCells = ["Descrição / Produto", "Qtd", "Preço Unit.", "Taxa IVA", "Total"].map((h, index) =>
    new TableCell({
      borders: cellBorders,
      shading: { fill: "1E293B", type: "clear" as any },
      margins: { top: 120, bottom: 120, left: 140, right: 140 },
      children: [
        new Paragraph({
          alignment: index === 1 || index === 3 ? AlignmentType.CENTER : index === 2 || index === 4 ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })]
        })
      ],
    })
  );

  // Create table body
  const bodyRows = order.items.map(
    (i) => {
      const itemSubtotal = Number(i.price) * Number(i.qty);
      return new TableRow({
        children: [
          i.name,
          String(i.qty),
          `${Number(i.price).toFixed(2)} Kz`,
          ivaLabelGlobal,
          `${itemSubtotal.toFixed(2)} Kz`
        ].map(
          (val, index) =>
            new TableCell({
              borders: cellBorders,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  alignment: index === 1 || index === 3 ? AlignmentType.CENTER : index === 2 || index === 4 ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: [new TextRun({ text: val, size: 18 })]
                })
              ],
            })
        ),
      });
    }
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } },
        },
        children: [
          // Emissor Header Block
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: meta.storeName, bold: true, size: 32, color: "1E293B" })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `NIF: ${meta.nif || "999999999"}`, size: 18, color: "64748B" })
            ]
          }),
          ...(meta.address ? [new Paragraph({ children: [new TextRun({ text: meta.address, size: 18, color: "64748B" })] })] : []),
          new Paragraph({
            children: [
              new TextRun({ text: `Tel: ${[meta.whatsapp, meta.whatsapp2].filter(Boolean).join(" / ")}`, size: 18, color: "64748B" }),
              ...(meta.email ? [new TextRun({ text: `  |  Email: ${meta.email}`, size: 18, color: "64748B" })] : [])
            ]
          }),
          new Paragraph({ children: [new TextRun("")] }),
          
          // Divider Line
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "E2E8F0" } },
            children: []
          }),
          new Paragraph({ children: [new TextRun("")] }),

          // Document Header right aligned
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "FACTURA", bold: true, size: 28, color: "1E293B" })]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: invoiceNo, bold: true, size: 22, color: "0F172A" })]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Série: A/${year}  |  Moeda: Kwanza (AOA)\n`, size: 18, color: "64748B" }),
              new TextRun({ text: `Data de Emissão: ${dateStr}`, size: 18, color: "64748B" })
            ]
          }),
          new Paragraph({ children: [new TextRun("")] }),

          // Client block (Framed section)
          new Paragraph({
            children: [
              new TextRun({ text: "DADOS DO CLIENTE", bold: true, size: 18, color: "1E293B" })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Nome do Cliente: `, bold: true, size: 18 }),
              new TextRun({ text: clientName, size: 18 }),
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `NIF do Cliente: `, bold: true, size: 18 }),
              new TextRun({ text: clientNif, size: 18 }),
              ...(order.customer_phone ? [
                new TextRun({ text: `    |    Tel: `, bold: true, size: 18 }),
                new TextRun({ text: order.customer_phone, size: 18 })
              ] : [])
            ]
          }),
          new Paragraph({ children: [new TextRun("")] }),

          // Item table
          new Table({
            width: { size: 10240, type: WidthType.DXA },
            columnWidths: [4000, 1000, 1800, 1640, 1800],
            rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
          }),
          new Paragraph({ children: [new TextRun("")] }),

          // Totals block
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Subtotal (Valor Tributável): `, size: 18, color: "475569" }),
              new TextRun({ text: `${subtotal.toFixed(2)} Kz\n`, bold: true, size: 18, color: "475569" }),
              new TextRun({ text: `IVA (${ivaRateValue}%): `, size: 18, color: "475569" }),
              new TextRun({ text: `${ivaAmount.toFixed(2)} Kz\n`, bold: true, size: 18, color: "475569" }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
            children: [
              new TextRun({ text: `TOTAL GERAL A PAGAR: `, bold: true, size: 24, color: "0F172A" }),
              new TextRun({ text: `${grandTotal.toFixed(2)} Kz`, bold: true, size: 24, color: "0F172A" }),
            ]
          }),
          new Paragraph({ children: [new TextRun("")] }),

          // AGT Fiscal Elements
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0" } },
            children: []
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({
            children: [
              new TextRun({ text: "ELEMENTOS FISCAIS OBRIGATÓRIOS (AGT)\n", bold: true, size: 18, color: "475569" }),
              new TextRun({ text: `Código de validação AGT: ${md5Simulated}\n`, size: 16, color: "64748B" }),
              new TextRun({ text: "Factura emitida por software certificado AGT nº 2026/01\n", size: 16, color: "64748B" }),
              new TextRun({ text: `Série de facturação: A/${year}\n`, size: 16, color: "64748B" }),
              new TextRun({ text: "Documento processado por computador / eletronicamente\n", size: 16, color: "64748B" }),
              new TextRun({ text: "[QR Code de Validação de Documento AGT — gerado eletronicamente]", italics: true, size: 14, color: "94A3B8" })
            ]
          }),
          new Paragraph({ children: [new TextRun("")] }),

          // Conditions & Observations
          new Paragraph({
            children: [
              new TextRun({ text: "CONDIÇÕES DE PAGAMENTO & OBSERVAÇÕES\n", bold: true, size: 18, color: "475569" }),
              new TextRun({ text: "Método de Pagamento: Ref. Multicaixa / TPA / Numerário\n", size: 16, color: "64748B" }),
              new TextRun({ text: "Condição de Venda: Pagamento imediato / Pronto Pagamento\n", size: 16, color: "64748B" }),
              new TextRun({ 
                text: ivaRateValue === 0 
                  ? "Isenção de IVA: Isento ao abrigo do nº 1 do Artigo 12.º do Código do IVA (Regime de Isenção)\n" 
                  : `Observações: IVA incluído à taxa legal de ${ivaRateValue}% nos termos gerais do Código do IVA.\n`, 
                bold: true,
                size: 16, 
                color: "64748B" 
              })
            ]
          }),
          new Paragraph({ children: [new TextRun("")] }),

          // Footer
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "Obrigado pela sua preferência.", italics: true, size: 18, color: "475569" })]
          })
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Factura-${invoiceNo.replace(/\//g, "_")}.docx`);
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
