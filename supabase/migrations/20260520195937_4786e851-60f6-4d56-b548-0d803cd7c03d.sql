-- Restrict listing of store-assets storage bucket to admins (public URLs still work)
DROP POLICY IF EXISTS "Public can view store assets" ON storage.objects;
CREATE POLICY "Admins can list store assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'store-assets' AND has_role(auth.uid(), 'admin'::app_role));

-- Lock down direct execution of SECURITY DEFINER helper; RLS policies still use it as table owner
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;