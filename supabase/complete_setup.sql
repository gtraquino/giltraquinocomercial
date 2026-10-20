-- ==========================================================
-- SCRIPT COMPLETO DE ESTRUTURA E COLUNAS DAS TABELAS
-- ==========================================================

-- 1. Criação do tipo de função de utilizador (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

-- 2. Tabela user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Função has_role
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

GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated, anon;

-- 4. Tabela stores com todas as colunas
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantir que TODAS as colunas existem
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('comercial', 'restaurante')) DEFAULT 'comercial';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS currency TEXT CHECK (currency IN ('Kz', 'USD')) DEFAULT 'Kz';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT '';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp_2 TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS accent_color TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS nif TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS hero_title TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS opening_time TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS closing_time TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS paid_until DATE;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_amount NUMERIC(10,2);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_period TEXT CHECK (subscription_period IN ('monthly','quarterly'));
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 5. Tabela store_managers
CREATE TABLE IF NOT EXISTS public.store_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);
ALTER TABLE public.store_managers ENABLE ROW LEVEL SECURITY;

-- Função is_store_manager
CREATE OR REPLACE FUNCTION public.is_store_manager(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_managers
    WHERE user_id = _user_id AND store_id = _store_id
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_store_manager(UUID, UUID) TO authenticated, anon;

-- 6. Tabela products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 7. Tabela orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'Kz',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 8. Tabela store_payments
CREATE TABLE IF NOT EXISTS public.store_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('monthly','quarterly')),
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  covers_until DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
ALTER TABLE public.store_payments ENABLE ROW LEVEL SECURITY;

-- 9. Storage bucket para imagens
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 10. Políticas RLS para Stores
DROP POLICY IF EXISTS "Anyone can view stores" ON public.stores;
CREATE POLICY "Anyone can view stores"
ON public.stores FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can insert stores" ON public.stores;
CREATE POLICY "Admins can insert stores"
ON public.stores FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins or managers can update stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can update stores" ON public.stores;
CREATE POLICY "Admins or managers can update stores"
ON public.stores FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), id))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_store_manager(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can delete stores" ON public.stores;
CREATE POLICY "Admins can delete stores"
ON public.stores FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- 11. Políticas RLS para Products
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
CREATE POLICY "Anyone can view products"
ON public.products FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins or managers can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
CREATE POLICY "Admins or managers can insert products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

DROP POLICY IF EXISTS "Admins or managers can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
CREATE POLICY "Admins or managers can update products"
ON public.products FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id))
WITH CHECK (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

DROP POLICY IF EXISTS "Admins or managers can delete products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Admins or managers can delete products"
ON public.products FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

-- 12. Políticas RLS para Orders
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Orders must target a real active store" ON public.orders;
CREATE POLICY "Orders must target a real active store"
ON public.orders FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = orders.store_id
      AND s.is_blocked = false
      AND (s.paid_until IS NULL OR s.paid_until >= CURRENT_DATE)
  )
  AND length(btrim(customer_name)) BETWEEN 1 AND 180
  AND length(btrim(customer_phone)) BETWEEN 3 AND 40
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) BETWEEN 1 AND 200
  AND total >= 0 AND total <= 100000000
  AND length(currency) BETWEEN 1 AND 10
);

DROP POLICY IF EXISTS "Admins and store managers can view orders" ON public.orders;
CREATE POLICY "Admins and store managers can view orders"
ON public.orders FOR SELECT
USING (has_role(auth.uid(), 'admin') OR is_store_manager(auth.uid(), store_id));

-- 13. Políticas RLS para Store Managers
DROP POLICY IF EXISTS "Admins can manage store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "Admins manage store_managers" ON public.store_managers;
CREATE POLICY "Admins can manage store_managers"
ON public.store_managers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers can view their own store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "Users can view their own manager rows" ON public.store_managers;
CREATE POLICY "Managers can view their own store_managers"
ON public.store_managers FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Atualização de is_store_manager para abranger stores.owner_id
CREATE OR REPLACE FUNCTION public.is_store_manager(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_managers
    WHERE user_id = _user_id AND store_id = _store_id
  ) OR EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = _store_id AND owner_id = _user_id
  );
$$;

-- 14. Permissões de tabelas
GRANT SELECT ON public.stores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT, INSERT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_managers TO authenticated;
GRANT ALL ON public.store_managers TO service_role;

-- 14. Forçar notificação ao PostgREST para atualizar o Schema Cache
NOTIFY pgrst, 'reload schema';
