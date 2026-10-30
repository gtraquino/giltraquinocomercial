DROP POLICY IF EXISTS "Anyone can view stores" ON public.stores;
CREATE POLICY "Public can view active stores; staff view own" ON public.stores
FOR SELECT USING (
  is_blocked = false
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_store_manager(auth.uid(), id)
);

DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
CREATE POLICY "Public can view products of active stores; staff view own" ON public.products
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.is_blocked = false)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_store_manager(auth.uid(), store_id)
);