-- ==============================================================================
-- MIGRATION: 20260910153000_fix_security_and_multitenancy.sql
-- CORREÇÕES DE SEGURANÇA, ISOLAMENTO MULTI-LOJA, STOCK ATÓMICO E PERMISSÕES
-- ==============================================================================

-- 1. FUNÇÃO DE AUTORIZAÇÃO DE GESTÃO DE LOJA (is_store_manager)
-- Considera: Administrador Global OU Proprietário (created_by) OU Co-Gestor (store_managers)
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

REVOKE ALL ON FUNCTION public.is_store_manager(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_manager(UUID, UUID) TO authenticated, service_role;


-- 2. FUNÇÃO DE VERIFICAÇÃO DE ROLE (has_role) com search_path seguro
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

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;


-- 3. TRIGGER PARA PROTEGER CAMPOS ADMINISTRATIVOS EM STORES (Ponto 4)
-- Apenas Administradores Globais podem alterar is_blocked, paid_until, subscription_amount, subscription_period e created_by
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
      RAISE EXCEPTION 'Apenas administradores podem alterar o prazo de pagamento da loja.';
    END IF;
    IF NEW.subscription_amount IS DISTINCT FROM OLD.subscription_amount THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o montante da subscrição.';
    END IF;
    IF NEW.subscription_period IS DISTINCT FROM OLD.subscription_period THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o período da subscrição.';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Não é permitido alterar a titularidade original da loja.';
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


-- 4. POLÍTICAS DE GESTÃO DE GESTORES (store_managers) (Pontos 8 e 9)
-- Administradores globais e proprietários da loja podem consultar, adicionar e remover co-gestores
DROP POLICY IF EXISTS "Admins manage store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "Users can view their own manager rows" ON public.store_managers;
DROP POLICY IF EXISTS "Admins and owners manage store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "Managers can view their own store_managers" ON public.store_managers;
DROP POLICY IF EXISTS "store_managers_select" ON public.store_managers;
DROP POLICY IF EXISTS "store_managers_insert" ON public.store_managers;
DROP POLICY IF EXISTS "store_managers_delete" ON public.store_managers;

CREATE POLICY "store_managers_select"
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

CREATE POLICY "store_managers_insert"
ON public.store_managers FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_managers.store_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "store_managers_delete"
ON public.store_managers FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_managers.store_id AND s.created_by = auth.uid()
  )
);


-- 5. POLÍTICAS DE PRODUTOS (Pontos 5 e 10)
DROP POLICY IF EXISTS "Admins or managers can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins or managers can update products" ON public.products;
DROP POLICY IF EXISTS "Admins or managers can delete products" ON public.products;
DROP POLICY IF EXISTS "products_insert_isolated" ON public.products;
DROP POLICY IF EXISTS "products_update_isolated" ON public.products;
DROP POLICY IF EXISTS "products_delete_isolated" ON public.products;

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


-- 6. POLÍTICAS DE ENCOMENDAS (orders) (Pontos 6 e 10)
DROP POLICY IF EXISTS "Admins and store managers can view orders" ON public.orders;
DROP POLICY IF EXISTS "Admins and store managers can delete orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_isolated" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_isolated" ON public.orders;

CREATE POLICY "orders_select_isolated"
ON public.orders FOR SELECT
TO authenticated
USING (
  public.is_store_manager(auth.uid(), store_id)
);

CREATE POLICY "orders_delete_isolated"
ON public.orders FOR DELETE
TO authenticated
USING (
  public.is_store_manager(auth.uid(), store_id)
);


-- 7. POLÍTICA DE PAGAMENTOS (store_payments) (Ponto 7)
-- Apenas Administrador Global e o Proprietário da loja podem consultar pagamentos
-- Co-gestores operacionais NÃO têm acesso a pagamentos
DROP POLICY IF EXISTS "Managers can view their store payments" ON public.store_payments;
DROP POLICY IF EXISTS "Admins manage all payments" ON public.store_payments;
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


-- 8. STORAGE: ISOLAMENTO HERMÉTICO DE ASSETS POR PASTA DE LOJA (Ponto 3)
DROP POLICY IF EXISTS "Admins and store managers can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins and store managers can update store assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins and store managers can delete store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can update store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can delete store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and admins can list store assets" ON storage.objects;

-- Upload de ficheiros no bucket 'store-assets': apenas admin ou gestor autorizado da loja no path
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

-- Atualização de ficheiros no bucket 'store-assets': apenas admin ou gestor autorizado da loja no path
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

-- Eliminação de ficheiros no bucket 'store-assets': apenas admin ou gestor autorizado da loja no path
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


-- 9. CRIAÇÃO DE PEDIDO ATÓMICA COM VALIDAÇÃO DE PREÇOS E DECREMENTO DE STOCK (Pontos 5 e 6)
-- Executada pelo cliente público/anónimo ou autenticado com segurança garantida pelo servidor
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

  -- 3. Percorrer itens, verificar existência, preços reais e decrementar stock com lock (FOR UPDATE)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(_items) AS x(id UUID, qty INT)
  LOOP
    v_qty := COALESCE(v_item.qty, 1);
    IF v_qty <= 0 THEN
      v_qty := 1;
    END IF;

    -- Seleciona produto bloqueando a linha para prevenir race conditions
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

    -- Acumular total verificado com o preço real da base de dados
    v_calc_total := v_calc_total + (v_prod.price * v_qty);

    -- Análise e decremento de stock no formato [STOCK:N]
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

    -- Adicionar ao JSON de itens verificados
    v_verified_items := v_verified_items || jsonb_build_object(
      'id', v_prod.id,
      'name', v_prod.name,
      'price', v_prod.price,
      'qty', v_qty
    );
  END LOOP;

  -- 4. Inserir encomenda final com dados e totais 100% verificados no servidor
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
