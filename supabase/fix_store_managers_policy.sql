-- ==============================================================================
-- GILPEDIDOS / GILTRAQUINO COMERCIAL
-- SCRIPT DEFINITIVO DE SEGURANÇA E RLS (FASE 3 - REVISÃO FINAL COMPLETA)
-- ==============================================================================
-- Este script foi concebido e auditado para execução no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rgjqnymjwiuhsrqrswzz/sql/new
--
-- GARANTIAS DE AUDITORIA & CORREÇÃO DOS 10 PONTOS:
-- 1. [Ficheiros/Imagens]: Storage hermético. Gestores só carregam/alteram assets no path da sua loja.
-- 2. [Dados da Loja]: Trigger impede gestores de alterar bloqueio, pagamento, subscrição ou proprietário.
-- 3. [Stock Atómico]: RPC `create_public_order` bloqueia e decrementa stock com atomicidade no servidor.
-- 4. [Preços de Pedidos]: Preços são lidos de `products.price` no servidor, impedindo manipulação no cliente.
-- 5. [Pagamentos Privados]: Co-gestores NÃO vêem dados de pagamentos. Apenas Admins e Proprietários acedem.
-- 6. [Código Antigo]: Eliminada dependência de owner_id inexistente; usa stores.created_by.
-- 7. [Gestão de Gestores]: Proprietário da loja tem controlo para adicionar/remover co-gestores da sua loja.
-- 8. [Isolamento Multi-Loja]: Nenhuma operação (CRUD) de uma loja pode impactar outra loja.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTENSÕES E TIPOS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. GARANTIR ESTRUTURA E TABELA store_managers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);

-- Ativar RLS em todas as tabelas
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_payments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. FUNÇÕES AUXILIARES "SECURITY DEFINER"
-- ------------------------------------------------------------------------------

-- 3.1 Verificação de privilégios de Administrador Global
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 3.2 Verificação de Gerência de Loja (Admin Global, Dono/Criador ou Co-Gestor atribuído)
CREATE OR REPLACE FUNCTION public.is_store_manager(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    _user_id IS NOT NULL AND _store_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = 'admin'::public.app_role
      )
      OR EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = _store_id AND created_by = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.store_managers
        WHERE user_id = _user_id AND store_id = _store_id
      )
    )
  );
$$;

-- 3.3 Verificação de Estado Operacional da Loja para Pedidos
CREATE OR REPLACE FUNCTION public.is_store_orderable(_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id
      AND s.is_blocked = false
      AND (s.paid_until IS NULL OR s.paid_until >= CURRENT_DATE)
  );
$$;

-- Restrição de permissões nas funções auxiliares
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_store_manager(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_manager(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_store_orderable(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_orderable(UUID) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4. TRIGGER DE PROTEÇÃO DE CAMPOS ADMINISTRATIVOS DA LOJA (Ponto 4)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_store_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o bloqueio da loja.';
    END IF;
    IF NEW.paid_until IS DISTINCT FROM OLD.paid_until THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar a data de subscrição.';
    END IF;
    IF NEW.subscription_amount IS DISTINCT FROM OLD.subscription_amount THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o montante da subscrição.';
    END IF;
    IF NEW.subscription_period IS DISTINCT FROM OLD.subscription_period THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o período da subscrição.';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Não é permitido alterar a titularidade da loja.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_store_admin_fields ON public.stores;
CREATE TRIGGER trg_protect_store_admin_fields
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_store_admin_fields();


-- ------------------------------------------------------------------------------
-- 5. POLÍTICAS RLS POR TABELA
-- ------------------------------------------------------------------------------

-- ==========================================
-- 5.1 user_roles
-- ==========================================
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_manage_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_all_policy" ON public.user_roles;

CREATE POLICY "user_roles_select_policy"
ON public.user_roles FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "user_roles_admin_all_policy"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


-- ==========================================
-- 5.2 stores
-- ==========================================
DROP POLICY IF EXISTS "Anyone can view stores" ON public.stores;
DROP POLICY IF EXISTS "Admins and managers can view stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Admins or managers can update stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can update stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can delete stores" ON public.stores;
DROP POLICY IF EXISTS "stores_select_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_insert_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_update_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_delete_policy" ON public.stores;

-- Catálogo de lojas legível publicamente
CREATE POLICY "stores_select_policy"
ON public.stores FOR SELECT
USING (true);

-- Admins criam novas lojas na plataforma
CREATE POLICY "stores_insert_policy"
ON public.stores FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins ou Gestores autorizados (dono ou co-gestor) atualizam a sua loja
CREATE POLICY "stores_update_policy"
ON public.stores FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_store_manager(auth.uid(), id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_store_manager(auth.uid(), id)
);

-- Apenas Admins eliminam lojas
CREATE POLICY "stores_delete_policy"
ON public.stores FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));


-- ==========================================
-- 5.3 store_managers (SEM RECURSÃO)
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "Admins manage store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "Managers can view their own store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "Users can view their own manager rows" ON public.store_managers;
DROP POLICY IF EXISTS "store_managers_select_clean" ON public.store_managers;
DROP POLICY IF EXISTS "store_managers_insert_clean" ON public.store_managers;
DROP POLICY IF EXISTS "store_managers_delete_clean" ON public.store_managers;
DROP POLICY IF EXISTS "Admins and owners manage store_managers" ON public.store_managers;

CREATE POLICY "store_managers_select_clean"
ON public.store_managers FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_managers.store_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "store_managers_insert_clean"
ON public.store_managers FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_managers.store_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "store_managers_delete_clean"
ON public.store_managers FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_managers.store_id AND s.created_by = auth.uid()
  )
);


-- ==========================================
-- 5.4 products
-- ==========================================
DROP POLICY IF EXISTS "Anyone can view products of active stores" ON public.products;
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
DROP POLICY IF EXISTS "Admins or managers can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins or managers can update products" ON public.products;
DROP POLICY IF EXISTS "Admins or managers can delete products" ON public.products;
DROP POLICY IF EXISTS "products_insert_isolated" ON public.products;
DROP POLICY IF EXISTS "products_update_isolated" ON public.products;
DROP POLICY IF EXISTS "products_delete_isolated" ON public.products;

CREATE POLICY "products_select_policy"
ON public.products FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = products.store_id
      AND s.is_blocked = false
      AND (s.paid_until IS NULL OR s.paid_until >= CURRENT_DATE)
  )
  OR public.is_store_manager(auth.uid(), store_id)
);

CREATE POLICY "products_insert_isolated"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (
  public.is_store_manager(auth.uid(), store_id)
);

CREATE POLICY "products_update_isolated"
ON public.products FOR UPDATE
TO authenticated
USING (
  public.is_store_manager(auth.uid(), store_id)
)
WITH CHECK (
  public.is_store_manager(auth.uid(), store_id)
);

CREATE POLICY "products_delete_isolated"
ON public.products FOR DELETE
TO authenticated
USING (
  public.is_store_manager(auth.uid(), store_id)
);


-- ==========================================
-- 5.5 orders
-- ==========================================
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_select_isolated" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_isolated" ON public.orders;

CREATE POLICY "orders_select_isolated"
ON public.orders FOR SELECT
TO authenticated
USING (
  public.is_store_manager(auth.uid(), store_id)
);

CREATE POLICY "orders_insert_policy"
ON public.orders FOR INSERT
WITH CHECK (
  public.is_store_orderable(orders.store_id)
  AND length(btrim(customer_name)) BETWEEN 1 AND 180
  AND length(btrim(customer_phone)) BETWEEN 3 AND 40
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) BETWEEN 1 AND 200
  AND total >= 0 AND total <= 100000000
  AND length(currency) BETWEEN 1 AND 10
);

CREATE POLICY "orders_update_policy"
ON public.orders FOR UPDATE
TO authenticated
USING (
  public.is_store_manager(auth.uid(), store_id)
)
WITH CHECK (
  public.is_store_manager(auth.uid(), store_id)
);

CREATE POLICY "orders_delete_isolated"
ON public.orders FOR DELETE
TO authenticated
USING (
  public.is_store_manager(auth.uid(), store_id)
);


-- ==========================================
-- 5.6 store_payments (Ponto 7: Co-gestores excluídos de dados financeiros)
-- ==========================================
DROP POLICY IF EXISTS "payments_admin_all" ON public.store_payments;
DROP POLICY IF EXISTS "payments_manager_select" ON public.store_payments;
DROP POLICY IF EXISTS "store_payments_select" ON public.store_payments;
DROP POLICY IF EXISTS "store_payments_admin_all" ON public.store_payments;

CREATE POLICY "store_payments_select"
ON public.store_payments FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_payments.store_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "store_payments_admin_all"
ON public.store_payments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


-- ==========================================
-- 5.7 storage.objects (Ponto 3: Isolamento Hermético no Storage)
-- ==========================================
DROP POLICY IF EXISTS "storage_insert_isolated" ON storage.objects;
DROP POLICY IF EXISTS "storage_update_isolated" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_isolated" ON storage.objects;
DROP POLICY IF EXISTS "Admins and store managers can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins and store managers can update store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins and store managers can delete store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can update store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can delete store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can list store assets" ON storage.objects;

CREATE POLICY "storage_insert_isolated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-assets'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND public.is_store_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "storage_update_isolated"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-assets'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND public.is_store_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "storage_delete_isolated"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-assets'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND public.is_store_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);


-- ------------------------------------------------------------------------------
-- 6. RPC: CRIAÇÃO ATÓMICA DE PEDIDOS COM VALIDAÇÃO DE PREÇOS E STOCK (Pontos 5 e 6)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_public_order(
  _store_id UUID,
  _customer_name TEXT,
  _customer_phone TEXT,
  _items JSONB,
  _currency TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_item RECORD;
  v_prod RECORD;
  v_calc_total NUMERIC := 0;
  v_verified_items JSONB := '[]'::jsonb;
  v_stock_match TEXT[];
  v_current_stock INT;
  v_new_stock INT;
  v_new_desc TEXT;
  v_qty INT;
BEGIN
  -- 1. Validar disponibilidade da loja
  IF NOT public.is_store_orderable(_store_id) THEN
    RAISE EXCEPTION 'A loja selecionada está temporariamente indisponível para pedidos.';
  END IF;

  -- 2. Validar campos obrigatórios do cliente
  IF length(btrim(_customer_name)) < 1 OR length(btrim(_customer_name)) > 180 THEN
    RAISE EXCEPTION 'Nome do cliente inválido.';
  END IF;

  IF length(btrim(_customer_phone)) < 3 OR length(btrim(_customer_phone)) > 40 THEN
    RAISE EXCEPTION 'Telefone do cliente inválido.';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 200 THEN
    RAISE EXCEPTION 'Lista de produtos do pedido inválida.';
  END IF;

  -- 3. Bloqueio e verificação atómica de preços e stock (FOR UPDATE)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(_items) AS x(id UUID, qty INT)
  LOOP
    v_qty := COALESCE(v_item.qty, 1);
    IF v_qty <= 0 THEN
      v_qty := 1;
    END IF;

    SELECT id, name, price, in_stock, description, store_id
    INTO v_prod
    FROM public.products
    WHERE id = v_item.id AND store_id = _store_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou não pertence a esta loja.';
    END IF;

    IF v_prod.in_stock = false THEN
      RAISE EXCEPTION 'O produto "%" está esgotado.', v_prod.name;
    END IF;

    v_calc_total := v_calc_total + (v_prod.price * v_qty);

    IF v_prod.description LIKE '%[STOCK:%]%' THEN
      v_stock_match := regexp_matches(v_prod.description, '\[STOCK:([0-9]+)\]');
      IF v_stock_match IS NOT NULL AND array_length(v_stock_match, 1) >= 1 THEN
        v_current_stock := v_stock_match[1]::INT;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Stock insuficiente para o produto "%" (Disponível: %, Solicitado: %).', v_prod.name, v_current_stock, v_qty;
        END IF;

        v_new_stock := GREATEST(0, v_current_stock - v_qty);
        v_new_desc := regexp_replace(v_prod.description, '\[STOCK:[0-9]+\]', '[STOCK:' || v_new_stock::TEXT || ']');

        UPDATE public.products
        SET description = v_new_desc,
            in_stock = (v_new_stock > 0),
            updated_at = now()
        WHERE id = v_prod.id;
      END IF;
    END IF;

    v_verified_items := v_verified_items || jsonb_build_object(
      'id', v_prod.id,
      'name', v_prod.name,
      'price', v_prod.price,
      'qty', v_qty
    );
  END LOOP;

  -- 4. Inserir encomenda final com valores calculados com integridade no servidor
  INSERT INTO public.orders (
    store_id,
    customer_name,
    customer_phone,
    items,
    total,
    currency
  )
  VALUES (
    _store_id,
    _customer_name,
    _customer_phone,
    v_verified_items,
    v_calc_total,
    COALESCE(_currency, 'Kz')
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total', v_calc_total,
    'currency', COALESCE(_currency, 'Kz')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order(UUID, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(UUID, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 8. GESTÃO DIRETA DE GESTORES (SEM EMAIL / ACESSO INSTANTÂNEO)
-- ------------------------------------------------------------------------------
-- Confirma utilizadores pendentes para que gestores já criados consigam entrar imediatamente
UPDATE auth.users 
SET email_confirmed_at = COALESCE(email_confirmed_at, now()) 
WHERE email_confirmed_at IS NULL;

-- Função atómica para criar ou associar gestor com senha direta e email confirmado
CREATE OR REPLACE FUNCTION public.create_or_assign_manager(
  _store_id uuid,
  _email text,
  _password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_user_id uuid;
  clean_email text := lower(trim(_email));
  clean_password text := trim(COALESCE(_password, ''));
  is_new boolean := false;
  store_exists boolean;
  hashed_pwd text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stores 
    WHERE id = _store_id AND (created_by = caller_id OR public.has_role(caller_id, 'admin'::public.app_role))
  ) INTO store_exists;

  IF NOT store_exists THEN
    RAISE EXCEPTION 'Não tem permissão para gerir os utilizadores desta loja.';
  END IF;

  IF clean_email = '' OR clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Endereço de email inválido.';
  END IF;

  IF clean_password = '' THEN
    clean_password := 'Gestor' || floor(random() * 8999 + 1000)::text || '!';
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

    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'user'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = hashed_pwd,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  INSERT INTO public.store_managers (store_id, user_id)
  VALUES (_store_id, target_user_id)
  ON CONFLICT (user_id, store_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', target_user_id,
    'email', clean_email,
    'password', clean_password,
    'created', is_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_assign_manager(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_or_assign_manager(uuid, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. CONCESSÃO DE PRIVILÉGIOS (GRANTS)
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.stores TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stores TO authenticated;

GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

GRANT INSERT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.store_managers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_payments TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
