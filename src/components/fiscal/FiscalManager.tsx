import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileDown, FilePlus2, FileX2, Plus, Trash2, ShieldCheck, Landmark, Receipt, FileCode2 } from "lucide-react";
import {
  listStoresForPanel, fetchInvoices, fetchInvoiceItems, fetchCustomers, createInvoice, fetchStoreOrders,
  DOC_TYPE_LABELS, IVA_RATES, formatFiscalNumber, formatKz, validateNIF, buildSaftXml,
  FiscalDocType, InvoiceRow,
} from "@/lib/fiscal";
import { exportFiscalDocPDF } from "@/lib/fiscalPdf";

type Line = { description: string; quantity: string; unit_price: string };
const emptyLine: Line = { description: "", quantity: "1", unit_price: "" };
const today = () => new Date().toISOString().slice(0, 10);

export default function FiscalManager() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState("");
  const [open, setOpen] = useState(false);
  const [ncFor, setNcFor] = useState<InvoiceRow | null>(null);

  const [docType, setDocType] = useState<FiscalDocType>("FT");
  const [customerId, setCustomerId] = useState("");
  const [cName, setCName] = useState("Consumidor Final");
  const [cNif, setCNif] = useState("");
  const [cAddr, setCAddr] = useState("");
  const [iva, setIva] = useState("14");
  const [issueDate, setIssueDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [orderId, setOrderId] = useState("");

  const { data: stores = [] } = useQuery({
    queryKey: ["fiscal-stores", user?.id, isAdmin],
    queryFn: () => listStoresForPanel(user!.id, isAdmin),
    enabled: !!user,
  });
  useEffect(() => { if (!storeId && stores[0]) setStoreId(stores[0].id); }, [stores, storeId]);
  const store = stores.find((s) => s.id === storeId);

  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", storeId], queryFn: () => fetchInvoices(storeId), enabled: !!storeId });
  const { data: customers = [] } = useQuery({ queryKey: ["customers", storeId], queryFn: () => fetchCustomers(storeId), enabled: !!storeId });
  const { data: orders = [] } = useQuery({ queryKey: ["fiscal-orders", storeId], queryFn: () => fetchStoreOrders(storeId), enabled: !!storeId && open });

  const stats = useMemo(() => {
    const sign = (i: InvoiceRow) => (i.doc_type === "NC" ? -1 : i.doc_type === "RC" ? 0 : 1);
    return {
      sales: invoices.reduce((s, i) => s + sign(i) * Number(i.total), 0),
      iva: invoices.reduce((s, i) => s + sign(i) * Number(i.iva_amount), 0),
      count: invoices.length,
    };
  }, [invoices]);

  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
    const tax = Math.round(sub * Number(iva)) / 100;
    return { sub, tax, total: sub + tax };
  }, [lines, iva]);

  const reset = () => {
    setDocType("FT"); setCustomerId(""); setCName("Consumidor Final"); setCNif(""); setCAddr("");
    setIva("14"); setIssueDate(today()); setNotes(""); setReason(""); setLines([{ ...emptyLine }]); setOrderId(""); setNcFor(null);
  };

  const openNew = () => { reset(); setOpen(true); };

  const openCreditNote = async (inv: InvoiceRow) => {
    reset();
    const items = await fetchInvoiceItems([inv.id]);
    setNcFor(inv); setDocType("NC");
    setCName(inv.customer_name); setCNif(inv.customer_nif || ""); setCAddr(inv.customer_address || "");
    setIva(String(Number(inv.iva_rate)));
    setLines(items.map((i) => ({ description: i.description, quantity: String(Number(i.quantity)), unit_price: String(Number(i.unit_price)) })));
    setOpen(true);
  };

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) { setCName(c.name); setCNif(c.nif || ""); setCAddr(c.address || ""); }
  };

  const pickOrder = (id: string) => {
    setOrderId(id);
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    setCName(o.customer_name);
    setLines((o.items || []).map((i) => ({ description: i.name || "Artigo", quantity: String(i.qty || 1), unit_price: String(i.price || 0) })));
  };

  const emit = useMutation({
    mutationFn: async () => {
      if (cNif.trim() && !validateNIF(cNif)) throw new Error("NIF angolano inválido: deve ter exatamente 9 dígitos.");
      if (!cName.trim()) throw new Error("Nome do cliente obrigatório.");
      if (docType === "NC" && reason.trim().length < 5) throw new Error("Indique o motivo da rectificação (mín. 5 caracteres).");
      const items = lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price) }));
      if (items.some((i) => !i.description || !(i.quantity > 0) || !(i.unit_price >= 0) || isNaN(i.unit_price)))
        throw new Error("Verifique a descrição, quantidade e preço de todas as linhas.");
      return createInvoice({
        storeId, docType, customerName: cName, customerNif: cNif, customerAddress: cAddr,
        customerId: customerId || undefined, items, ivaRate: Number(iva), notes, issueDate,
        reason: docType === "NC" ? reason : undefined, correctedInvoiceId: ncFor?.id, sourceOrderId: orderId || undefined,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["invoices", storeId] });
      setOpen(false);
      toast({ title: "Documento emitido", description: `${formatFiscalNumber(r.series, r.number)} — ${formatKz(r.total)}` });
    },
    onError: (e: Error) => toast({ title: "Não emitido", description: e.message, variant: "destructive" }),
  });

  const downloadPdf = async (inv: InvoiceRow) => {
    if (!store) return;
    const items = await fetchInvoiceItems([inv.id]);
    const orig = inv.corrected_invoice_id ? invoices.find((i) => i.id === inv.corrected_invoice_id) : undefined;
    exportFiscalDocPDF(inv, items, store, orig ? formatFiscalNumber(orig.series, orig.number) : undefined);
  };

  const exportSaft = async () => {
    if (!store) return;
    const year = new Date().getFullYear();
    const items = await fetchInvoiceItems(invoices.map((i) => i.id));
    const xml = buildSaftXml(store, invoices, items, year);
    const blob = new Blob([xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `SAFT-AO_${(store.nif || "sem-nif")}_${year}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> Facturação Fiscal (AGT)</h2>
        <div className="flex flex-wrap gap-2">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Loja" /></SelectTrigger>
            <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={exportSaft} disabled={!invoices.length} className="gap-2"><FileCode2 className="h-4 w-4" />SAF-T (AO)</Button>
          <Button onClick={openNew} disabled={!storeId} className="gap-2"><FilePlus2 className="h-4 w-4" />Emitir documento</Button>
        </div>
      </div>

      {store && !store.nif && (
        <p className="text-sm rounded-md border border-destructive/40 bg-destructive/10 p-3">
          A empresa emitente ainda não tem NIF configurado. Preencha-o em "Contactos" para documentos conformes.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground flex items-center gap-1"><Landmark className="h-3.5 w-3.5" />Total de vendas</p><p className="text-2xl font-bold">{formatKz(stats.sales)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3.5 w-3.5" />IVA liquidado</p><p className="text-2xl font-bold">{formatKz(stats.iva)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Documentos emitidos</p><p className="text-2xl font-bold">{stats.count}</p></CardContent></Card>
      </div>

      <div className="grid gap-2">
        {invoices.map((inv) => (
          <Card key={inv.id}><CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold font-mono">{formatFiscalNumber(inv.series, inv.number)}</span>
                <Badge variant="secondary">{DOC_TYPE_LABELS[inv.doc_type]}</Badge>
                {inv.status === "rectified"
                  ? <Badge variant="destructive">Rectificado</Badge>
                  : <Badge variant="outline">Conforme</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{inv.issue_date} • {inv.customer_name}{inv.customer_nif ? ` • NIF ${inv.customer_nif}` : ""}{inv.reason ? ` • Motivo: ${inv.reason}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{inv.doc_type === "NC" ? "−" : ""}{formatKz(inv.total)}</span>
              <Button size="sm" variant="outline" onClick={() => downloadPdf(inv)} className="gap-1"><FileDown className="h-4 w-4" />PDF</Button>
              {(inv.doc_type === "FT" || inv.doc_type === "FR") && inv.status === "emitted" && (
                <Button size="sm" variant="ghost" onClick={() => openCreditNote(inv)} className="gap-1"><FileX2 className="h-4 w-4" />Nota de Crédito</Button>
              )}
            </div>
          </CardContent></Card>
        ))}
        {!invoices.length && <p className="text-sm text-muted-foreground">Ainda não foram emitidos documentos fiscais.</p>}
        <p className="text-xs text-muted-foreground">Documentos emitidos não podem ser editados nem apagados. Erros corrigem-se apenas com Nota de Crédito.</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{ncFor ? `Nota de Crédito sobre ${formatFiscalNumber(ncFor.series, ncFor.number)}` : "Emitir documento fiscal"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Tipo</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as FiscalDocType)} disabled={!!ncFor}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(["FT", "FR", "RC"] as FiscalDocType[]).concat(ncFor ? ["NC"] : []).map((t) => <SelectItem key={t} value={t}>{t} — {DOC_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Data de emissão</Label><Input type="date" max={today()} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            </div>

            {!ncFor && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Cliente registado</Label>
                  <Select value={customerId} onValueChange={pickCustomer}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.nif})</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="space-y-1"><Label>A partir de pedido</Label>
                  <Select value={orderId} onValueChange={pickOrder}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{new Date(o.created_at).toLocaleDateString("pt-PT")} — {o.customer_name}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Nome do cliente</Label><Input value={cName} onChange={(e) => setCName(e.target.value)} disabled={!!ncFor} /></div>
              <div className="space-y-1"><Label>NIF (9 dígitos)</Label><Input value={cNif} onChange={(e) => setCNif(e.target.value)} placeholder="Consumidor final" disabled={!!ncFor} />
                {cNif && !validateNIF(cNif) && <p className="text-xs text-destructive">NIF inválido</p>}</div>
            </div>
            <div className="space-y-1"><Label>Morada fiscal</Label><Input value={cAddr} onChange={(e) => setCAddr(e.target.value)} disabled={!!ncFor} /></div>

            {docType === "NC" && (
              <div className="space-y-1"><Label>Motivo da rectificação / anulação *</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ex: Devolução de mercadoria / erro no preço" /></div>
            )}

            <div className="space-y-2">
              <Label>Linhas</Label>
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_70px_110px_36px] gap-2">
                  <Input placeholder="Descrição" value={l.description} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                  <Input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                  <Input type="number" min="0" step="any" placeholder="Preço Kz" value={l.unit_price} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} />
                  <Button size="icon" variant="ghost" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setLines([...lines, { ...emptyLine }])} className="gap-1"><Plus className="h-4 w-4" />Linha</Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Taxa de IVA</Label>
                <Select value={iva} onValueChange={setIva}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{IVA_RATES.map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
            </div>

            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatKz(totals.sub)}</span></div>
              <div className="flex justify-between"><span>IVA ({iva}%)</span><span>{formatKz(totals.tax)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span>{formatKz(totals.total)}</span></div>
            </div>
            <p className="text-xs text-muted-foreground">Após emissão, o documento recebe número sequencial definitivo e não poderá ser alterado.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => emit.mutate()} disabled={emit.isPending}>{emit.isPending ? "A emitir..." : "Emitir definitivamente"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
