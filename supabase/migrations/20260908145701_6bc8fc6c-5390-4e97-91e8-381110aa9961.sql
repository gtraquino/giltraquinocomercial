-- 1. Orders: validate anonymous inserts
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
CREATE POLICY "Orders must target a real active store"
ON public.orders
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.is_blocked = false)
  AND length(btrim(customer_name)) BETWEEN 1 AND 120
  AND length(btrim(customer_phone)) BETWEEN 3 AND 40
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) BETWEEN 1 AND 200
  AND total >= 0 AND total <= 100000000
  AND length(currency) BETWEEN 1 AND 10
);

-- 2. Stores: hide fiscal/subscription data from the public
DROP POLICY IF EXISTS "Anyone can view stores" ON public.stores;
CREATE POLICY "Admins and managers can view stores"
ON public.stores
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), id));

CREATE OR REPLACE VIEW public.stores_public
WITH (security_barrier = true) AS
SELECT
  id, name, type, currency, whatsapp, whatsapp_2,
  logo_url, primary_color, accent_color, address,
  hero_title, opening_time, closing_time, is_blocked,
  created_at, updated_at
FROM public.stores;

GRANT SELECT ON public.stores_public TO anon, authenticated;

-- 3. Storage: let store managers upload store assets
DROP POLICY IF EXISTS "Admins can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete store assets" ON storage.objects;

CREATE POLICY "Admins and store managers can upload store assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'store-assets'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.store_managers sm WHERE sm.user_id = auth.uid())
  )
);

CREATE POLICY "Admins and store managers can update store assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'store-assets'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.store_managers sm WHERE sm.user_id = auth.uid())
  )
);

CREATE POLICY "Admins and store managers can delete store assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'store-assets'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.store_managers sm WHERE sm.user_id = auth.uid())
  )
);