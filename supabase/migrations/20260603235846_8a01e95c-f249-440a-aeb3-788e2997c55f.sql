-- Allow store managers to manage products of their stores
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

CREATE POLICY "Admins or managers can insert products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

CREATE POLICY "Admins or managers can update products"
ON public.products FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id))
WITH CHECK (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

CREATE POLICY "Admins or managers can delete products"
ON public.products FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

-- Allow store managers to update their store info (logo, colors, whatsapp, etc.)
DROP POLICY IF EXISTS "Admins can update stores" ON public.stores;
CREATE POLICY "Admins or managers can update stores"
ON public.stores FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), id))
WITH CHECK (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), id));
