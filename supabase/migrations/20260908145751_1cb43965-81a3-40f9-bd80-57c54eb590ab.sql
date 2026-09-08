DROP VIEW IF EXISTS public.stores_public;

DROP POLICY IF EXISTS "Admins and managers can view stores" ON public.stores;
CREATE POLICY "Anyone can view stores"
ON public.stores
FOR SELECT
USING (true);

REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (
  id, name, type, currency, whatsapp, whatsapp_2,
  logo_url, primary_color, accent_color, address,
  hero_title, opening_time, closing_time, is_blocked,
  created_at, updated_at
) ON public.stores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;

DROP POLICY IF EXISTS "Orders must target a real active store" ON public.orders;
CREATE POLICY "Orders must target a real active store"
ON public.orders
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = orders.store_id
      AND s.is_blocked = false
      AND (s.paid_until IS NULL OR s.paid_until >= CURRENT_DATE)
  )
  AND length(btrim(customer_name)) BETWEEN 1 AND 120
  AND length(btrim(customer_phone)) BETWEEN 3 AND 40
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) BETWEEN 1 AND 200
  AND total >= 0 AND total <= 100000000
  AND length(currency) BETWEEN 1 AND 10
);