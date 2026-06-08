import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Lock, Unlock, CheckCircle2, AlertTriangle, History, Save, Wallet } from "lucide-react";
import { addPeriod, isStoreBlocked, periodLabel } from "@/lib/billing";

interface StoreRow {
  id: string;
  name: string;
  currency: string;
  subscription_amount: number | null;
  subscription_period: "monthly" | "quarterly" | null;
  paid_until: string | null;
  is_blocked: boolean;
}

interface PaymentRow {
  id: string;
  store_id: string;
  amount: number;
  period: "monthly" | "quarterly";
  paid_at: string;
  covers_until: string;
  notes: string | null;
}

export default function BillingManager() {
  const qc = useQueryClient();
  const [editStore, setEditStore] = useState<StoreRow | null>(null);
  const [payStore, setPayStore] = useState<StoreRow | null>(null);
  const [historyStore, setHistoryStore] = useState<StoreRow | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["billing-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,currency,subscription_amount,subscription_period,paid_until,is_blocked")
        .order("name");
      if (error) throw error;
      return data as StoreRow[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Mensalidades</h2>
        <p className="text-sm text-muted-foreground">
          Defina o valor da mensalidade de cada loja, registe pagamentos e bloqueie o acesso em caso de incumprimento.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">A carregar...</p>
      ) : stores.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma loja registada.</p>
      ) : (
        <div className="grid gap-4">
          {stores.map((s) => {
            const blocked = isStoreBlocked(s);
            const overdue = !s.is_blocked && blocked;
            return (
              <Card key={s.id} className={blocked ? "border-destructive/50" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{s.name}</CardTitle>
                    {s.is_blocked ? (
                      <Badge variant="destructive" className="gap-1">
                        <Lock className="h-3 w-3" /> Bloqueada manualmente
                      </Badge>
                    ) : overdue ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Mensalidade em atraso
                      </Badge>
                    ) : s.paid_until ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Em dia até {s.paid_until}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sem mensalidade definida</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Valor</p>
                      <p className="font-medium">
                        {s.subscription_amount != null
                          ? `${Number(s.subscription_amount).toFixed(2)} ${s.currency}`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Periodicidade</p>
                      <p className="font-medium">{periodLabel(s.subscription_period)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Paga até</p>
                      <p className="font-medium">{s.paid_until || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Estado</p>
                      <p className="font-medium">{blocked ? "Bloqueada" : "Ativa"}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditStore(s)}>
                      <Save className="h-4 w-4 mr-1" /> Definir mensalidade
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setPayStore(s)}
                      disabled={!s.subscription_amount || !s.subscription_period}
                    >
                      <Wallet className="h-4 w-4 mr-1" /> Registar pagamento
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistoryStore(s)}>
                      <History className="h-4 w-4 mr-1" /> Histórico
                    </Button>
                    <Button
                      size="sm"
                      variant={s.is_blocked ? "outline" : "destructive"}
                      onClick={async () => {
                        const { error } = await supabase
                          .from("stores")
                          .update({ is_blocked: !s.is_blocked })
                          .eq("id", s.id);
                        if (error) {
                          toast({ title: "Erro", description: error.message, variant: "destructive" });
                        } else {
                          toast({ title: s.is_blocked ? "Loja desbloqueada" : "Loja bloqueada" });
                          qc.invalidateQueries({ queryKey: ["billing-stores"] });
                        }
                      }}
                    >
                      {s.is_blocked ? (
                        <><Unlock className="h-4 w-4 mr-1" /> Desbloquear</>
                      ) : (
                        <><Lock className="h-4 w-4 mr-1" /> Bloquear</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editStore && (
        <EditSubscriptionDialog
          store={editStore}
          onClose={() => setEditStore(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["billing-stores"] })}
        />
      )}
      {payStore && (
        <RegisterPaymentDialog
          store={payStore}
          onClose={() => setPayStore(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["billing-stores"] })}
        />
      )}
      {historyStore && (
        <PaymentHistoryDialog store={historyStore} onClose={() => setHistoryStore(null)} />
      )}
    </div>
  );
}

function EditSubscriptionDialog({
  store,
  onClose,
  onSaved,
}: {
  store: StoreRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(store.subscription_amount?.toString() ?? "");
  const [period, setPeriod] = useState<"monthly" | "quarterly">(
    store.subscription_period ?? "monthly"
  );
  const [paidUntil, setPaidUntil] = useState(store.paid_until ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("stores")
        .update({
          subscription_amount: amount ? Number(amount) : null,
          subscription_period: period,
          paid_until: paidUntil || null,
        })
        .eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Mensalidade atualizada" });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mensalidade – {store.name}</DialogTitle>
          <DialogDescription>
            Defina o valor e a periodicidade. Ao registar um pagamento, a data "Paga até" será atualizada automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Valor ({store.currency})</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: 20.00"
            />
          </div>
          <div>
            <Label>Periodicidade</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as "monthly" | "quarterly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="quarterly">Trimestral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paga até (opcional)</Label>
            <Input
              type="date"
              value={paidUntil}
              onChange={(e) => setPaidUntil(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterPaymentDialog({
  store,
  onClose,
  onSaved,
}: {
  store: StoreRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(store.subscription_amount?.toString() ?? "");
  const [period, setPeriod] = useState<"monthly" | "quarterly">(
    store.subscription_period ?? "monthly"
  );
  const [paidAt, setPaidAt] = useState(today);
  // Default covers_until = max(paid_until, today) + period
  const baseDate =
    store.paid_until && new Date(store.paid_until) > new Date(today)
      ? new Date(store.paid_until)
      : new Date(today);
  const [coversUntil, setCoversUntil] = useState(addPeriod(baseDate, period));
  const [notes, setNotes] = useState("");

  const register = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("store_payments").insert({
        store_id: store.id,
        amount: Number(amount),
        period,
        paid_at: paidAt,
        covers_until: coversUntil,
        notes: notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      // Also update store paid_until and unblock
      const { error: e2 } = await supabase
        .from("stores")
        .update({ paid_until: coversUntil, is_blocked: false })
        .eq("id", store.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast({ title: "Pagamento registado" });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registar pagamento – {store.name}</DialogTitle>
          <DialogDescription>
            Ao gravar, a loja fica ativa e a data "Paga até" é atualizada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor ({store.currency})</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Periodicidade</Label>
              <Select
                value={period}
                onValueChange={(v) => {
                  const p = v as "monthly" | "quarterly";
                  setPeriod(p);
                  setCoversUntil(addPeriod(baseDate, p));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data do pagamento</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div>
              <Label>Cobre até</Label>
              <Input type="date" value={coversUntil} onChange={(e) => setCoversUntil(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: Transferência bancária" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => register.mutate()} disabled={register.isPending || !amount}>
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentHistoryDialog({ store, onClose }: { store: StoreRow; onClose: () => void }) {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["store-payments", store.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_payments")
        .select("*")
        .eq("store_id", store.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as PaymentRow[];
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico – {store.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground">A carregar...</p>
        ) : payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sem pagamentos registados.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {payments.map((p) => (
              <div key={p.id} className="border rounded-md p-3 text-sm flex flex-wrap gap-x-4 gap-y-1 justify-between">
                <div>
                  <span className="font-medium">{Number(p.amount).toFixed(2)} {store.currency}</span>
                  <span className="text-muted-foreground"> · {periodLabel(p.period)}</span>
                </div>
                <div className="text-muted-foreground">
                  Pago em {p.paid_at} → cobre até <span className="font-medium text-foreground">{p.covers_until}</span>
                </div>
                {p.notes && <div className="w-full text-xs text-muted-foreground">{p.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
