
-- Store managers (per-store access)
CREATE TABLE public.store_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);
ALTER TABLE public.store_managers ENABLE ROW LEVEL SECURITY;

-- Security definer: is the user a manager of a given store?
CREATE OR REPLACE FUNCTION public.is_store_manager(_user_id uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_managers
    WHERE user_id = _user_id AND store_id = _store_id
  )
$$;

CREATE POLICY "Admins manage store_managers"
ON public.store_managers FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own manager rows"
ON public.store_managers FOR SELECT
USING (auth.uid() = user_id);

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_store_created ON public.orders(store_id, created_at DESC);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create orders"
ON public.orders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins and store managers can view orders"
ON public.orders FOR SELECT
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

CREATE POLICY "Admins and store managers can delete orders"
ON public.orders FOR DELETE
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));
