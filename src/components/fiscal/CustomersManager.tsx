import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Users, Pencil, Trash2, Plus } from "lucide-react";
import {
  listStoresForPanel, fetchCustomers, createCustomer, updateCustomer, deleteCustomer,
  validateNIF, CustomerRow,
} from "@/lib/fiscal";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
  nif: z.string().trim().refine(validateNIF, "NIF angolano inválido (9 dígitos)"),
  address: z.string().trim().min(5, "Morada fiscal completa obrigatória").max(300),
  phone: z.string().trim().min(3, "Contacto obrigatório").max(40),
  email: z.string().trim().max(255).email("Email inválido").or(z.literal("")),
});

const empty = { name: "", nif: "", address: "", phone: "", email: "" };

export default function CustomersManager() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: stores = [] } = useQuery({
    queryKey: ["fiscal-stores", user?.id, isAdmin],
    queryFn: () => listStoresForPanel(user!.id, isAdmin),
    enabled: !!user,
  });
  useEffect(() => { if (!storeId && stores[0]) setStoreId(stores[0].id); }, [stores, storeId]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", storeId],
    queryFn: () => fetchCustomers(storeId),
    enabled: !!storeId,
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = customerSchema.safeParse(form);
      if (!parsed.success) {
        const e: Record<string, string> = {};
        parsed.error.issues.forEach((i) => (e[String(i.path[0])] = i.message));
        setErrors(e);
        throw new Error("Corrija os campos assinalados.");
      }
      setErrors({});
      const input = { storeId, ...parsed.data } as any;
      return editing ? updateCustomer(editing, input) : createCustomer(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", storeId] });
      setForm(empty); setEditing(null);
      toast({ title: "Cliente guardado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers", storeId] }),
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const edit = (c: CustomerRow) => {
    setEditing(c.id);
    setForm({ name: c.name, nif: c.nif || "", address: c.address || "", phone: c.phone || "", email: c.email || "" });
  };

  const field = (k: keyof typeof empty, label: string, ph = "") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={form[k]} placeholder={ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" /> Clientes</h2>
      <Select value={storeId} onValueChange={setStoreId}>
        <SelectTrigger className="w-full sm:w-[280px]"><SelectValue placeholder="Loja" /></SelectTrigger>
        <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
      </Select>

      <Card><CardContent className="pt-6 grid gap-3 sm:grid-cols-2">
        {field("name", "Nome / Denominação")}
        {field("nif", "NIF (9 dígitos)", "000000000")}
        {field("address", "Morada fiscal completa", "Rua, nº, bairro, município, província")}
        {field("phone", "Telefone", "+244 900 000 000")}
        {field("email", "Email (opcional)")}
        <div className="flex items-end gap-2">
          <Button onClick={() => save.mutate()} disabled={!storeId || save.isPending} className="gap-2">
            <Plus className="h-4 w-4" />{editing ? "Actualizar" : "Adicionar cliente"}
          </Button>
          {editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(empty); }}>Cancelar</Button>}
        </div>
      </CardContent></Card>

      <div className="grid gap-2">
        {customers.map((c) => (
          <Card key={c.id}><CardContent className="py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">NIF {c.nif} • {c.phone} • {c.address}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={() => edit(c)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => confirm("Eliminar cliente?") && del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </CardContent></Card>
        ))}
        {!customers.length && <p className="text-sm text-muted-foreground">Sem clientes registados.</p>}
      </div>
    </div>
  );
}
