
-- Add image columns
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS accent_color TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create public storage bucket for store assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for store-assets bucket
CREATE POLICY "Public can view store assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-assets');

CREATE POLICY "Admins can upload store assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'store-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update store assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'store-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete store assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'store-assets' AND has_role(auth.uid(), 'admin'::app_role));
