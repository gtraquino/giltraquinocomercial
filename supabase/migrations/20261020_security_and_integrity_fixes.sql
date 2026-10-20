-- ====================================================================
-- MIGRAÇÃO DE CORREÇÕES DE SEGURANÇA, INTEGRIDADE E PERSISTÊNCIA
-- Data: 20 de Outubro de 2026
-- 1. SEC-01: Bloqueio de redefinição não-autorizada de palavras-passe
-- 2. NEG-01: Função transacional anti-adulteração de preços em encomendas
-- 3. FAT-01: Persistência cloud multi-tenant de dados de faturação
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. SEGURANÇA: Restringir set_or_create_user_password a Administradores
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 2. INTEGRIDADE DE ENCOMENDAS (ANTI-TAMPERING & VALIDAÇÃO DE PREÇOS)
-- --------------------------------------------------------------------
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
  -- 1. Validar se a loja está ativa e autorizada
  SELECT public.is_store_orderable(_store_id) INTO v_store_orderable;
  IF NOT v_store_orderable THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Loja temporariamente indisponível para novos pedidos.');
  END IF;

  -- 2. Validar formato dos dados do cliente
  IF length(trim(COALESCE(_customer_name, ''))) < 1 OR length(_customer_name) > 180 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nome do cliente inválido.');
  END IF;

  IF length(trim(COALESCE(_customer_phone, ''))) < 3 OR length(_customer_phone) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contacto do cliente inválido.');
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lista de itens do pedido inválida.');
  END IF;

  -- 3. Anti-tampering: Recalcular o preço e totais oficiais a partir da base de dados
  FOR v_item IN SELECT * FROM jsonb_to_recordset(_items) AS x(id uuid, name text, price numeric, qty int)
  LOOP
    v_item_id := v_item.id;
    v_item_qty := GREATEST(1, COALESCE(v_item.qty, 1));

    -- Obter o produto real da loja
    SELECT id, name, price, in_stock
    INTO v_product
    FROM public.products
    WHERE id = v_item_id AND store_id = _store_id
    LIMIT 1;

    IF v_product.id IS NOT NULL THEN
      -- PREÇO AUTÊNTICO DA BASE DE DADOS (sobrescreve manipulação maliciosa do cliente)
      v_item_price := v_product.price;
      v_item_name := v_product.name;
    ELSE
      -- Produto avulso: validar preço não-negativo
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

  -- 4. Gravar a encomenda segura
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

-- --------------------------------------------------------------------
-- 3. PERSISTÊNCIA MULTI-TENANT DE FATURAÇÃO NA CLOUD (FAT-01)
-- --------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_settings jsonb DEFAULT '{}'::jsonb;
