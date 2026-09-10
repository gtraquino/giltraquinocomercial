-- ====================================================================
-- MIGRATION: 20260909151500_fix_p0_security_and_permissions.sql
-- FIX CRITICAL P0 BUGS:
-- 1. SEC-01: Anonymous orders insertion failing due to lack of SELECT
--    privilege on public.stores(paid_until).
-- 2. SEC-02: Storage objects DELETE policy multi-tenancy isolation.
-- ====================================================================

-- 1. Grant SELECT on paid_until to anon and authenticated
GRANT SELECT (paid_until) ON public.stores TO anon;
GRANT SELECT (paid_until) ON public.stores TO authenticated;

-- 2. Create SECURITY DEFINER function to check store orderability
-- This avoids permission conflicts and safely verifies store status
CREATE OR REPLACE FUNCTION public.is_store_orderable(_store_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id
      AND s.is_blocked = false
      AND (s.paid_until IS NULL OR s.paid_until >= CURRENT_DATE)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_store_orderable(uuid) TO anon, authenticated, service_role;

-- 3. Update orders INSERT policy to use the SECURITY DEFINER check
DROP POLICY IF EXISTS "Orders must target a real active store" ON public.orders;
CREATE POLICY "Orders must target a real active store"
ON public.orders
FOR INSERT
WITH CHECK (
  public.is_store_orderable(orders.store_id)
  AND length(btrim(customer_name)) BETWEEN 1 AND 180
  AND length(btrim(customer_phone)) BETWEEN 3 AND 40
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) BETWEEN 1 AND 200
  AND total >= 0 AND total <= 100000000
  AND length(currency) BETWEEN 1 AND 10
);

-- 4. Multi-tenancy isolation for store-assets in Supabase Storage
-- Ensure managers can ONLY delete assets in their own store directory
DROP POLICY IF EXISTS "Admins and store managers can delete store assets" ON storage.objects;
CREATE POLICY "Admins and store managers can delete store assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'store-assets'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.store_managers sm
      WHERE sm.user_id = auth.uid()
      AND (storage.foldername(name))[1] = sm.store_id::text
    )
  )
);
