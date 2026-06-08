
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS subscription_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS subscription_period text CHECK (subscription_period IN ('monthly','quarterly')),
  ADD COLUMN IF NOT EXISTS paid_until date,
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.store_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  period text NOT NULL CHECK (period IN ('monthly','quarterly')),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  covers_until date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_payments TO authenticated;
GRANT ALL ON public.store_payments TO service_role;

ALTER TABLE public.store_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all payments"
  ON public.store_payments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their store payments"
  ON public.store_payments FOR SELECT
  TO authenticated
  USING (public.is_store_manager(auth.uid(), store_id));
