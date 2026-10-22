CREATE TABLE public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  nif text,
  address text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE public.invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  doc_type text not null check (doc_type in ('FT','FR','RC','NC')),
  series text not null,
  number integer not null check (number >= 1),
  status text not null default 'emitted' check (status in ('emitted','rectified')),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_nif text,
  customer_address text,
  issue_date date not null default current_date,
  subtotal numeric not null default 0,
  iva_rate numeric not null default 14,
  iva_amount numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'AOA',
  notes text,
  reason text,
  corrected_invoice_id uuid references public.invoices(id) on delete set null,
  source_order_id uuid references public.orders(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (store_id, series, number)
);

CREATE TABLE public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  line_subtotal numeric not null default 0,
  iva_rate numeric not null default 14,
  iva_amount numeric not null default 0,
  line_total numeric not null default 0
);

CREATE TABLE public.invoice_sequences (
  store_id uuid not null references public.stores(id) on delete cascade,
  series_key text not null,
  next_number integer not null default 1,
  primary key (store_id, series_key)
);

CREATE INDEX idx_invoices_store_id ON public.invoices(store_id);
CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX idx_customers_store_id ON public.customers(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT SELECT ON public.invoices TO authenticated;
GRANT SELECT ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoices TO service_role;
GRANT ALL ON public.invoice_items TO service_role;
GRANT ALL ON public.invoice_sequences TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e gestores gerem clientes da sua loja"
  ON public.customers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), store_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), store_id));

CREATE POLICY "Admins e gestores veem documentos da sua loja"
  ON public.invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), store_id));

CREATE POLICY "Admins e gestores veem linhas de documentos da sua loja"
  ON public.invoice_items FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), i.store_id))
    )
  );

-- Imutabilidade AGT: nenhuma policy de UPDATE/DELETE em invoices/invoice_items.

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_invoice(
  p_store_id uuid,
  p_doc_type text,
  p_customer_name text,
  p_customer_nif text DEFAULT NULL,
  p_customer_address text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_iva_rate numeric DEFAULT 14,
  p_notes text DEFAULT NULL,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_reason text DEFAULT NULL,
  p_corrected_invoice_id uuid DEFAULT NULL,
  p_source_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_number integer;
  v_series_key text;
  v_series text;
  v_invoice_id uuid;
  v_subtotal numeric := 0;
  v_iva_amount numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_line_sub numeric;
  v_line_iva numeric;
  v_year integer;
  v_desc text;
  v_qty numeric;
  v_price numeric;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), p_store_id)) THEN
    RAISE EXCEPTION 'Sem permissao para emitir documentos fiscais nesta loja.' USING ERRCODE = '42501';
  END IF;

  IF p_doc_type NOT IN ('FT','FR','RC','NC') THEN
    RAISE EXCEPTION 'Tipo de documento invalido.';
  END IF;

  IF p_customer_nif IS NOT NULL AND btrim(p_customer_nif) <> '' AND p_customer_nif !~ '^[0-9]{9}$' THEN
    RAISE EXCEPTION 'NIF invalido: o NIF angolano deve ter exatamente 9 digitos.';
  END IF;

  IF p_customer_name IS NULL OR length(btrim(p_customer_name)) < 1 OR length(btrim(p_customer_name)) > 200 THEN
    RAISE EXCEPTION 'Nome do cliente obrigatorio (1-200 caracteres).';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'O documento deve ter entre 1 e 500 linhas.';
  END IF;

  IF p_iva_rate NOT IN (0,2,5,7,14) THEN
    RAISE EXCEPTION 'Taxa de IVA nao permitida.';
  END IF;

  IF p_issue_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data de emissao nao pode ser futura.';
  END IF;

  -- Validar todas as linhas antes de reservar numero (evita saltos)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_desc := btrim(coalesce(v_item->>'description',''));
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    IF v_desc IS NULL OR length(v_desc) < 1 OR length(v_desc) > 500 THEN
      RAISE EXCEPTION 'Todas as linhas exigem uma descricao (1-500 caracteres).';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000 THEN
      RAISE EXCEPTION 'Quantidade invalida numa das linhas.';
    END IF;
    IF v_price IS NULL OR v_price < 0 OR v_price > 100000000 THEN
      RAISE EXCEPTION 'Preco unitario invalido numa das linhas.';
    END IF;
    v_line_sub := round(v_qty * v_price, 2);
    v_subtotal := v_subtotal + v_line_sub;
  END LOOP;

  -- Regras da Nota de Credito
  IF p_doc_type = 'NC' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'A Nota de Credito exige o motivo da rectificacao (minimo 5 caracteres).';
    END IF;
    IF p_corrected_invoice_id IS NULL THEN
      RAISE EXCEPTION 'A Nota de Credito deve referenciar o documento original.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = p_corrected_invoice_id AND i.store_id = p_store_id AND i.doc_type IN ('FT','FR')
    ) THEN
      RAISE EXCEPTION 'Documento original invalido para rectificacao.';
    END IF;
  END IF;

  v_year := extract(year from p_issue_date)::int;
  v_series := p_doc_type || ' ' || v_year;
  v_series_key := p_doc_type || '-' || v_year;

  INSERT INTO public.invoice_sequences (store_id, series_key, next_number)
  VALUES (p_store_id, v_series_key, 1)
  ON CONFLICT (store_id, series_key) DO NOTHING;

  SELECT next_number INTO v_number
  FROM public.invoice_sequences
  WHERE store_id = p_store_id AND series_key = v_series_key
  FOR UPDATE;

  UPDATE public.invoice_sequences
  SET next_number = v_number + 1
  WHERE store_id = p_store_id AND series_key = v_series_key;

  INSERT INTO public.invoices (
    store_id, doc_type, series, number, customer_id, customer_name, customer_nif,
    customer_address, issue_date, iva_rate, notes, reason, corrected_invoice_id,
    source_order_id, created_by
  ) VALUES (
    p_store_id, p_doc_type, v_series, v_number, p_customer_id, btrim(p_customer_name),
    nullif(btrim(coalesce(p_customer_nif,'')), ''), nullif(btrim(coalesce(p_customer_address,'')), ''),
    p_issue_date, p_iva_rate, p_notes, nullif(btrim(coalesce(p_reason,'')), ''),
    p_corrected_invoice_id, p_source_order_id, auth.uid()
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_desc := btrim(coalesce(v_item->>'description',''));
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_line_sub := round(v_qty * v_price, 2);
    v_line_iva := round(v_line_sub * p_iva_rate / 100.0, 2);
    INSERT INTO public.invoice_items
      (invoice_id, description, quantity, unit_price, line_subtotal, iva_rate, iva_amount, line_total)
    VALUES
      (v_invoice_id, v_desc, v_qty, v_price, v_line_sub, p_iva_rate, v_line_iva, v_line_sub + v_line_iva);
  END LOOP;

  v_iva_amount := round(v_subtotal * p_iva_rate / 100.0, 2);
  v_total := v_subtotal + v_iva_amount;

  UPDATE public.invoices
  SET subtotal = v_subtotal, iva_amount = v_iva_amount, total = v_total
  WHERE id = v_invoice_id;

  IF p_doc_type = 'NC' THEN
    UPDATE public.invoices SET status = 'rectified' WHERE id = p_corrected_invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_invoice_id, 'doc_type', p_doc_type, 'series', v_series, 'number', v_number,
    'subtotal', v_subtotal, 'iva_rate', p_iva_rate, 'iva_amount', v_iva_amount, 'total', v_total
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, text, text, text, text, uuid, jsonb, numeric, text, date, text, uuid, uuid) TO authenticated;
COMMENT ON TABLE public.invoices IS 'Documentos fiscais AGT. Imutaveis: sem UPDATE/DELETE para clientes da API. Correccoes apenas via Nota de Credito.';
COMMENT ON TABLE public.invoice_sequences IS 'Contadores sequenciais por loja e serie (tipo-ano). Reserva atomicamente numeros sem saltos.';