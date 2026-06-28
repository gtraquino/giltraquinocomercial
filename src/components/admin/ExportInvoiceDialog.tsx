import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportInvoicePDF,
  exportInvoiceTicketPDF,
  exportInvoiceDOCX,
  OrderRecord,
} from "@/lib/reportExport";
import { FileDown, Receipt, FileText, User, Hash, Settings, Info } from "lucide-react";

interface ExportInvoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderRecord | null;
  store: {
    id: string;
    name: string;
    currency: string;
    nif?: string | null;
    address?: string | null;
    whatsapp?: string | null;
    whatsapp_2?: string | null;
  } | null;
  initialFormat?: "A4" | "Ticket";
}

export default function ExportInvoiceDialog({
  isOpen,
  onClose,
  order,
  store,
  initialFormat,
}: ExportInvoiceDialogProps) {
  const [clientName, setClientName] = useState("");
  const [clientNif, setClientNif] = useState("999999999");
  const [printFormat, setPrintFormat] = useState<"A4" | "Ticket">("A4");
  const [prefix, setPrefix] = useState("FT");
  const [ivaRate, setIvaRate] = useState("14");

  // Load store-specific invoice settings & parse initial client data
  useEffect(() => {
    if (!order) return;

    // Parse name & NIF if they are combined in customer_name, e.g. "John Doe (NIF: 12345)"
    let initialName = order.customer_name || "Consumidor Final";
    let initialNif = "999999999";
    const nifMatch = initialName.match(/(.*?)\s*\(NIF:\s*([^\)]+)\)/i);
    if (nifMatch) {
      initialName = nifMatch[1].trim();
      initialNif = nifMatch[2].trim();
    }
    setClientName(initialName);
    setClientNif(initialNif);

    if (initialFormat) {
      setPrintFormat(initialFormat);
    } else if (store?.id) {
      const saved = localStorage.getItem(`invoice_settings_${store.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.prefix) setPrefix(parsed.prefix);
          if (parsed.ivaRate) setIvaRate(parsed.ivaRate);
          if (parsed.defaultFormat) setPrintFormat(parsed.defaultFormat);
        } catch (e) {
          console.error("Error loading invoice settings for dialog:", e);
        }
      }
    }
  }, [order, store, initialFormat, isOpen]);

  if (!order || !store) return null;

  const handleDownloadPDF = () => {
    // Construct dynamic order with customized customer name and NIF for output
    const formattedCustomerName = clientNif && clientNif !== "999999999"
      ? `${clientName} (NIF: ${clientNif})`
      : clientName;

    const modifiedOrder: OrderRecord = {
      ...order,
      customer_name: formattedCustomerName,
    };

    const reportMeta = {
      storeName: store.name,
      dateLabel: new Date(order.created_at).toLocaleDateString("pt-PT"),
      currency: store.currency,
      nif: store.nif || "999999999",
      address: store.address || "",
      whatsapp: store.whatsapp || "",
      whatsapp2: store.whatsapp_2 || "",
      prefix,
      ivaRate,
    };

    if (printFormat === "Ticket") {
      exportInvoiceTicketPDF(modifiedOrder, reportMeta);
    } else {
      exportInvoicePDF(modifiedOrder, reportMeta);
    }
    onClose();
  };

  const handleDownloadWord = () => {
    const formattedCustomerName = clientNif && clientNif !== "999999999"
      ? `${clientName} (NIF: ${clientNif})`
      : clientName;

    const modifiedOrder: OrderRecord = {
      ...order,
      customer_name: formattedCustomerName,
    };

    const reportMeta = {
      storeName: store.name,
      dateLabel: new Date(order.created_at).toLocaleDateString("pt-PT"),
      currency: store.currency,
      nif: store.nif || "999999999",
      address: store.address || "",
      whatsapp: store.whatsapp || "",
      whatsapp2: store.whatsapp_2 || "",
      prefix,
      ivaRate,
    };

    exportInvoiceDOCX(modifiedOrder, reportMeta);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Receipt className="h-5 w-5 text-indigo-600" />
            Opções de Exportação de Fatura
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Section: Format Selector */}
          <div className="space-y-2">
            <Label htmlFor="print-format" className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
              Formato de Impressão
            </Label>
            <Select
              value={printFormat}
              onValueChange={(val: "A4" | "Ticket") => setPrintFormat(val)}
            >
              <SelectTrigger id="print-format" className="w-full">
                <SelectValue placeholder="Selecione o formato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">
                  <div className="flex items-center gap-2">
                    <FileDown className="h-4 w-4 text-blue-500" />
                    <span>A4 (Padrão de Escritório)</span>
                  </div>
                </SelectItem>
                <SelectItem value="Ticket">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-amber-500" />
                    <span>Ticket Térmico (80mm)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-slate-100 my-1" />

          {/* Section: Client Customization */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> Dados de Facturação do Cliente
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dlg-client-name" className="text-xs">
                  Nome do Cliente
                </Label>
                <Input
                  id="dlg-client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Consumidor Final"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dlg-client-nif" className="text-xs">
                  NIF do Cliente
                </Label>
                <Input
                  id="dlg-client-nif"
                  value={clientNif}
                  onChange={(e) => setClientNif(e.target.value)}
                  placeholder="999999999"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 my-1" />

          {/* Section: Invoicing/Tax Metadata */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1">
              <Settings className="h-3.5 w-3.5" /> Metadados Fiscais (AGT 2026)
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dlg-prefix" className="text-xs">
                  Tipo de Documento
                </Label>
                <Select value={prefix} onValueChange={setPrefix}>
                  <SelectTrigger id="dlg-prefix" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FT">FT (Fatura)</SelectItem>
                    <SelectItem value="FR">FR (Fatura-Recibo)</SelectItem>
                    <SelectItem value="FS">FS (Fatura Simplificada)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="dlg-iva" className="text-xs">
                  Taxa de IVA (%)
                </Label>
                <Select value={ivaRate} onValueChange={setIvaRate}>
                  <SelectTrigger id="dlg-iva" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Isento - Art. 12º)</SelectItem>
                    <SelectItem value="5">5% (Taxa Reduzida)</SelectItem>
                    <SelectItem value="7">7% (Regime Simplificado)</SelectItem>
                    <SelectItem value="14">14% (Regime Geral)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {ivaRate === "0" && (
            <div className="flex gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
              <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>Isenção legal ativa:</strong> O documento incluirá automaticamente a menção legal obrigatória: 
                <em> &quot;Isenção: Isento ao abrigo do nº 1 do Artigo 12.º do Código do IVA.&quot;</em>
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="h-9 text-xs">
            Cancelar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadWord}
              className="h-9 text-xs gap-1.5 text-slate-700 hover:text-indigo-600 border-slate-200"
            >
              <FileText className="h-4 w-4 text-blue-500" />
              Microsoft Word
            </Button>
            <Button
              onClick={handleDownloadPDF}
              className="h-9 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {printFormat === "Ticket" ? (
                <>
                  <Receipt className="h-4 w-4" />
                  Imprimir Ticket
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  Exportar PDF A4
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
