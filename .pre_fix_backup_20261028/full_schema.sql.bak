-- COMBINED SCHEMA

-- ==========================================
-- FILE: 20260414103642_6ce58a76-f09c-4847-b051-3acb14d9d22d.sql
-- ==========================================

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Stores table
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('comercial', 'restaurante')),
  currency TEXT NOT NULL CHECK (currency IN ('Kz', 'USD')),
  whatsapp TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Anyone can view stores (public catalog)
CREATE POLICY "Anyone can view stores"
  ON public.stores FOR SELECT
  USING (true);

-- Admins can manage stores
CREATE POLICY "Admins can insert stores"
  ON public.stores FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update stores"
  ON public.stores FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete stores"
  ON public.stores FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Anyone can view products (public catalog)
CREATE POLICY "Anyone can view products"
  ON public.products FOR SELECT
  USING (true);

-- Admins can manage products
CREATE POLICY "Admins can insert products"
  ON public.products FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update products"
  ON public.products FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete products"
  ON public.products FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-assign 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- FILE: 20260417213258_78d71e7b-b5d8-4458-91c7-ae603d7796f6.sql
-- ==========================================
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'g.traquino66@gmail.com'
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

CREATE TRIGGER on_auth_user_created_assign_default_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- FILE: 20260417213333_227d2231-dbda-443e-af89-9b0ce584e4a8.sql
-- ==========================================
DROP TRIGGER IF EXISTS on_auth_user_created_assign_default_role ON auth.users;

CREATE TRIGGER on_auth_user_created_assign_default_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- FILE: 20260417213340_0d01eab9-bc2c-4a44-857d-dbebcc8ee85c.sql
-- ==========================================
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key
ON public.user_roles (user_id, role);

-- ==========================================
-- FILE: 20260417213424_f216c9be-ca3a-4222-857a-3b7b05976483.sql
-- ==========================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;

-- ==========================================
-- FILE: 20260417213456_cdaddb6d-e2a3-45f4-9d6e-fb707e6727cf.sql
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- ==========================================
-- FILE: 20260417213509_2b64beba-c027-486f-8c0e-223c6f7d5bc7.sql
-- ==========================================
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'g.traquino66@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- ==========================================
-- FILE: 20260418120137_86f8a824-0ac6-4e11-b253-7c93c0d8426a.sql
-- ==========================================
-- Historical placeholder. Any admin password setup is handled outside migrations.
-- Plaintext credentials removed for security.


-- ==========================================
-- FILE: 20260418121100_6e78b828-4c26-416d-82af-60d863116cec.sql
-- ==========================================
select 1;

-- ==========================================
-- FILE: 20260419095213_8c4d6eb9-37e0-42cb-89ff-6b50be5fc278.sql
-- ==========================================

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


-- ==========================================
-- FILE: 20260520195214_020a3768-8d5a-47b9-a7e7-55f7f8a21adf.sql
-- ==========================================
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp_2 text;

-- ==========================================
-- FILE: 20260520195937_4786e851-60f6-4d56-b548-0d803cd7c03d.sql
-- ==========================================
-- Restrict listing of store-assets storage bucket to admins (public URLs still work)
DROP POLICY IF EXISTS "Public can view store assets" ON storage.objects;
CREATE POLICY "Admins can list store assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'store-assets' AND has_role(auth.uid(), 'admin'::app_role));

-- Lock down direct execution of SECURITY DEFINER helper; RLS policies still use it as table owner
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- ==========================================
-- FILE: 20260520202614_e5022c86-8c3d-4000-9f85-0d05e5adbac2.sql
-- ==========================================

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


-- ==========================================
-- FILE: 20260521151551_0be9b748-20e8-42a8-9514-b414e46b4f36.sql
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated, service_role;

-- ==========================================
-- FILE: 20260521151602_9f889551-327c-49bf-b9f5-d441051a2bac.sql
-- ==========================================
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM authenticated;

-- ==========================================
-- FILE: 20260603235846_8a01e95c-f249-440a-aeb3-788e2997c55f.sql
-- ==========================================
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


-- ==========================================
-- FILE: 20260604001147_6f38f133-cc53-4338-9aad-52ce314fc07e.sql
-- ==========================================
-- Este usuário não existe na tabela auth.users em um novo projeto.
-- Desativamos esta query para evitar erros de restrição de chave estrangeira (foreign key).
-- INSERT INTO public.user_roles (user_id, role) VALUES ('a3bfb943-ffd4-4f32-9a11-51a627090042', 'admin') ON CONFLICT (user_id, role) DO NOTHING;

-- ==========================================
-- FILE: 20260606002241_d3e1c1ec-e3ef-4799-9ef2-95f5ee7c87bd.sql
-- ==========================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS nif text,
  ADD COLUMN IF NOT EXISTS address text;

-- ==========================================
-- FILE: 20260607011611_10679754-ef93-440a-97c0-ec4b4b37efd1.sql
-- ==========================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hero_title text,
  ADD COLUMN IF NOT EXISTS opening_time text,
  ADD COLUMN IF NOT EXISTS closing_time text;

-- ==========================================
-- FILE: 20260608204413_974223d6-4b38-4fac-a459-6de50b865081.sql
-- ==========================================

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


-- ==========================================
-- FILE: 20260620220000_reset_admin_password.sql
-- ==========================================
-- Historical migration: admin password reset was applied out-of-band.
-- Plaintext credentials removed for security. Do not store passwords in migrations.


-- ==========================================
-- FILE: 20260628200000_allow_authenticated_storage.sql
-- ==========================================
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


-- ==========================================
-- FILE: 20260908145701_6bc8fc6c-5390-4e97-91e8-381110aa9961.sql
-- ==========================================
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

-- ==========================================
-- FILE: 20260908145751_1cb43965-81a3-40f9-bd80-57c54eb590ab.sql
-- ==========================================
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

-- ==========================================
-- FILE: 20260909151500_fix_p0_security_and_permissions.sql
-- ==========================================
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
-- ==========================================
-- FILE: 20261020_security_and_integrity_fixes.sql
-- ==========================================
CREATE OR REPLACE FUNCTION public.set_or_create_user_password(
  p_email text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  clean_email text := lower(trim(p_email));
  clean_password text := trim(p_password);
  target_user_id uuid;
  hashed_pwd text;
  is_new boolean := false;
  caller_id uuid := auth.uid();
BEGIN
  -- Apenas administradores autenticados podem definir ou alterar palavras-passe diretamente
  IF caller_id IS NULL OR NOT public.has_role(caller_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso não autorizado: Esta operação exige privilégios de administrador autenticado.');
  END IF;

  IF clean_email = '' OR clean_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Endereço de email inválido.');
  END IF;

  IF length(clean_password) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A palavra-passe deve ter no mínimo 6 caracteres.');
  END IF;

  hashed_pwd := extensions.crypt(clean_password, extensions.gen_salt('bf'));

  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE lower(email) = clean_email 
  LIMIT 1;

  IF target_user_id IS NULL THEN
    target_user_id := gen_random_uuid();
    is_new := true;

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      role,
      aud,
      created_at,
      updated_at
    ) VALUES (
      target_user_id,
      '00000000-0000-0000-0000-000000000000',
      clean_email,
      hashed_pwd,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        target_user_id::text,
        target_user_id,
        jsonb_build_object('sub', target_user_id::text, 'email', clean_email),
        'email',
        now(),
        now(),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    IF clean_email IN ('g.traquino66@gmail.com', 'giltraquino@gmail.com') THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (target_user_id, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      INSERT INTO public.user_roles (user_id, role)
      VALUES (target_user_id, 'user'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  ELSE
    UPDATE auth.users
    SET encrypted_password = hashed_pwd,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', target_user_id,
    'email', clean_email,
    'created', is_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_or_create_user_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_or_create_user_password(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_public_order(
  _store_id uuid,
  _customer_name text,
  _customer_phone text,
  _items jsonb,
  _currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_store_orderable boolean;
  v_item record;
  v_product record;
  v_total numeric := 0;
  v_order_id uuid;
  v_sanitized_items jsonb := '[]'::jsonb;
  v_item_price numeric;
  v_item_qty int;
  v_item_id uuid;
  v_item_name text;
BEGIN
  SELECT public.is_store_orderable(_store_id) INTO v_store_orderable;
  IF NOT v_store_orderable THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Loja indisponível para pedidos no momento.');
  END IF;

  IF length(trim(COALESCE(_customer_name, ''))) < 1 OR length(_customer_name) > 180 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nome do cliente inválido.');
  END IF;

  IF length(trim(COALESCE(_customer_phone, ''))) < 3 OR length(_customer_phone) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contacto do cliente inválido.');
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lista de itens inválida.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(_items) AS x(id uuid, name text, price numeric, qty int)
  LOOP
    v_item_id := v_item.id;
    v_item_qty := GREATEST(1, COALESCE(v_item.qty, 1));

    SELECT id, name, price, in_stock
    INTO v_product
    FROM public.products
    WHERE id = v_item_id AND store_id = _store_id
    LIMIT 1;

    IF v_product.id IS NOT NULL THEN
      v_item_price := v_product.price;
      v_item_name := v_product.name;
    ELSE
      v_item_price := GREATEST(0, COALESCE(v_item.price, 0));
      v_item_name := COALESCE(v_item.name, 'Item');
    END IF;

    v_total := v_total + (v_item_price * v_item_qty);

    v_sanitized_items := v_sanitized_items || jsonb_build_object(
      'id', COALESCE(v_item_id::text, gen_random_uuid()::text),
      'name', v_item_name,
      'price', v_item_price,
      'qty', v_item_qty
    );
  END LOOP;

  INSERT INTO public.orders (
    store_id,
    customer_name,
    customer_phone,
    items,
    total,
    currency
  ) VALUES (
    _store_id,
    trim(_customer_name),
    trim(_customer_phone),
    v_sanitized_items,
    v_total,
    _currency
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, text, jsonb, text) TO anon, authenticated, service_role;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_settings jsonb DEFAULT '{}'::jsonb;



