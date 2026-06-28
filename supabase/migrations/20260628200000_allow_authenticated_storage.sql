-- Allow both admins and any authenticated users (like store managers) to manage store-assets
DROP POLICY IF EXISTS "Admins can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can list store assets" ON storage.objects;

-- Create updated, more inclusive policies for store-assets bucket
CREATE POLICY "Authenticated users and admins can upload store assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'store-assets');

CREATE POLICY "Authenticated users and admins can update store assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'store-assets');

CREATE POLICY "Authenticated users and admins can delete store assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'store-assets');

CREATE POLICY "Authenticated users and admins can list store assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'store-assets');
