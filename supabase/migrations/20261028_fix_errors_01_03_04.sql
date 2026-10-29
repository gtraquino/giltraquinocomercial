-- ====================================================================
-- MIGRAÇÃO CONTROLADA: 20261028_fix_errors_01_03_04.sql
-- OBJECTIVO: CORRECÇÃO ATÓMICA TWO-PASS DE STOCK EM ENCOMENDAS PÚBLICAS
-- PREVINE: DEDUÇÕES PARCIAIS, OVERFLOW, LINHAS REPETIDAS E CONTENÇÃO
-- ====================================================================

CREATE OR REPLACE FUNCTION public.create_public_order(
  _store_id uuid,
  _customer_name text,
  _customer_phone text,
  _items jsonb,
  _currency text DEFAULT 'Kz'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_store_orderable boolean;
  v_store_currency text;
  v_clean_name text := btrim(COALESCE(_customer_name, ''));
  v_clean_phone text := btrim(COALESCE(_customer_phone, ''));
  v_currency text;
  v_total numeric := 0;
  v_order_id uuid;
  v_sanitized_items jsonb := '[]'::jsonb;
  
  v_item record;
  v_product record;
  v_stock_tag_count int;
  v_stock_match text[];
  v_stock_val text;
  v_stock_num int;
  v_new_stock int;
  v_new_desc text;
  v_clean_desc text;
  v_new_in_stock boolean;
BEGIN
  -- 1. Validação de elegibilidade da loja
  IF _store_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'ID da loja obrigatório.',
      'code', 'INVALID_STORE'
    );
  END IF;

  SELECT public.is_store_orderable(_store_id) INTO v_store_orderable;
  IF NOT COALESCE(v_store_orderable, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Loja indisponível para encomendas no momento.',
      'code', 'STORE_UNAVAILABLE'
    );
  END IF;

  -- 2. Resolução da moeda da loja e validação da moeda da encomenda
  -- Kz é a moeda preferencial da aplicação GilPedidos quando a loja não tem moeda configurada.
  SELECT currency INTO v_store_currency FROM public.stores WHERE id = _store_id;
  v_store_currency := COALESCE(NULLIF(btrim(v_store_currency), ''), 'Kz');

  -- Determinação e validação da moeda da encomenda
  -- Nota técnica: O parâmetro _currency possui DEFAULT 'Kz'. Se omitido pelo cliente,
  -- o PostgreSQL atribui 'Kz'. Se for passado explicitamente NULL ou string vazia '',
  -- a função adopta a moeda efectiva da loja.
  IF _currency IS NULL OR btrim(_currency) = '' THEN
    v_currency := v_store_currency;
  ELSE
    v_currency := btrim(_currency);
    -- Se a moeda fornecida divergir da moeda da loja, rejeita sem conversão silenciosa
    IF v_currency <> v_store_currency THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Moeda incompatível com a loja.',
        'code', 'INVALID_CURRENCY'
      );
    END IF;
  END IF;

  -- 3. Validações estritas de dados do cliente
  IF length(v_clean_name) < 1 OR length(v_clean_name) > 180 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nome do cliente inválido.', 'code', 'INVALID_NAME');
  END IF;

  IF length(v_clean_phone) < 3 OR length(v_clean_phone) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contacto do cliente inválido.', 'code', 'INVALID_PHONE');
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lista de itens inválida.', 'code', 'INVALID_ITEMS');
  END IF;

  -- 4. Validação defensiva item a item (previne excepções não controladas de cast)
  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF (v_item.value->>'id') IS NULL OR (v_item.value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Item com identificador inválido no carrinho.',
        'code', 'INVALID_ITEMS'
      );
    END IF;

    IF (v_item.value->>'qty') IS NULL OR (v_item.value->>'qty') !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'A quantidade de cada produto deve ser superior a zero.',
        'code', 'INVALID_QUANTITY'
      );
    END IF;

    IF (v_item.value->>'qty')::numeric < 1 OR (v_item.value->>'qty')::numeric > 10000 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'A quantidade de cada produto deve ser entre 1 e 10.000 unidades.',
        'code', 'INVALID_QUANTITY'
      );
    END IF;
  END LOOP;

  -- ====================================================================
  -- FASE 1: VALIDAÇÃO TOTAL & BLOQUEIO DETERMINÍSTICO (READ-LOCK ONLY)
  -- Nenhuma operação de escrita (UPDATE/INSERT) é executada nesta fase.
  -- Agrupamos linhas repetidas e ordenamos por ID para mitigar riscos de
  -- deadlock por inversão de ordem de bloqueio entre pedidos concorrentes.
  -- Os bloqueios das linhas obtidos via FOR UPDATE mantêm-se activos até
  -- à conclusão da transacção.
  -- ====================================================================
  FOR v_item IN 
    SELECT 
      (elem->>'id')::uuid AS p_id,
      SUM((elem->>'qty')::int)::int AS total_qty
    FROM jsonb_array_elements(_items) AS elem
    GROUP BY (elem->>'id')::uuid
    ORDER BY p_id ASC
  LOOP
    -- Bloqueio pessimista na linha do produto na ordem canónica (FOR UPDATE)
    SELECT id, name, price, in_stock, description
    INTO v_product
    FROM public.products
    WHERE id = v_item.p_id AND store_id = _store_id
    FOR UPDATE;

    -- Verificar se o produto existe e pertence à loja indicada
    IF v_product.id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Um ou mais produtos não existem ou não pertencem a esta loja.',
        'code', 'PRODUCT_NOT_IN_STORE',
        'product_id', v_item.p_id
      );
    END IF;

    -- Verificar se o produto está ativo no catálogo
    IF NOT v_product.in_stock THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'O produto "' || v_product.name || '" encontra-se esgotado.',
        'code', 'OUT_OF_STOCK',
        'product_id', v_product.id
      );
    END IF;

    -- 1. Detecção rigorosa de marcadores incompletos com parênteses não balanceados
    IF (COALESCE(v_product.description, '') ~* '\[[^\]]*stock' AND COALESCE(v_product.description, '') !~* '\[[^\]]*stock[^\]]*\]')
       OR (COALESCE(v_product.description, '') ~* 'stock[^\[]*\]' AND COALESCE(v_product.description, '') !~* '\[[^\]]*stock[^\]]*\]') THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Configuração de stock malformada (marcador incompleto com parênteses não fechados) no produto: ' || v_product.name,
        'code', 'INVALID_STOCK_CONFIG',
        'product_id', v_product.id
      );
    END IF;

    -- 2. Detecção de directiva stock com dois pontos fora do padrão canónico
    IF COALESCE(v_product.description, '') ~* 'stock\s*:' 
       AND COALESCE(v_product.description, '') !~ '\[STOCK:(-?\d{1,9}|unlimited)\]' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Configuração de stock malformada ou directiva incompleta no produto: ' || v_product.name,
        'code', 'INVALID_STOCK_CONFIG',
        'product_id', v_product.id
      );
    END IF;

    -- 3. Contagem rigorosa de quaisquer marcadores delimitados por parênteses que refiram 'stock'
    SELECT count(*)::int INTO v_stock_tag_count
    FROM regexp_matches(COALESCE(v_product.description, ''), '\[[^\]]*stock[^\]]*\]', 'gi');

    -- Rejeitar se existirem marcadores de stock duplicados
    IF v_stock_tag_count > 1 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Configuração de stock inválida (marcadores duplicados) no produto: ' || v_product.name,
        'code', 'INVALID_STOCK_CONFIG',
        'product_id', v_product.id
      );
    END IF;

    -- Rejeitar se existir um marcador delimitado que não cumpra estritamente o formato canónico
    IF v_stock_tag_count = 1 AND COALESCE(v_product.description, '') !~ '\[STOCK:(-?\d{1,9}|unlimited)\]' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Configuração de stock malformada ou ambígua no produto: ' || v_product.name,
        'code', 'INVALID_STOCK_CONFIG',
        'product_id', v_product.id
      );
    END IF;

    -- Validação de stock disponível (apenas para produtos com stock limitado e marcador canónico)
    IF v_stock_tag_count = 1 AND COALESCE(v_product.description, '') ~ '\[STOCK:(-?\d{1,9}|unlimited)\]' THEN
      v_stock_match := regexp_matches(v_product.description, '\[STOCK:(-?\d{1,9}|unlimited)\]');
      IF v_stock_match IS NOT NULL AND array_length(v_stock_match, 1) >= 1 THEN
        v_stock_val := v_stock_match[1];
        IF v_stock_val <> 'unlimited' THEN
          v_stock_num := v_stock_val::int;
          IF v_stock_num < v_item.total_qty THEN
            -- Rejeição atómica: nenhuma alteração foi efectuada em qualquer produto
            RETURN jsonb_build_object(
              'ok', false,
              'error', 'Stock insuficiente para "' || v_product.name || '". Disponível: ' || GREATEST(0, v_stock_num) || ', Solicitado: ' || v_item.total_qty,
              'code', 'INSUFFICIENT_STOCK',
              'product_id', v_product.id,
              'available', GREATEST(0, v_stock_num),
              'requested', v_item.total_qty
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ====================================================================
  -- FASE 2: EXECUÇÃO ATÓMICA (100% DOS ITENS FORAM VALIDADOS COM SUCESSO)
  -- ====================================================================
  -- 2.1 Dedução de stock dos produtos controlados
  FOR v_item IN 
    SELECT 
      (elem->>'id')::uuid AS p_id,
      SUM((elem->>'qty')::int)::int AS total_qty
    FROM jsonb_array_elements(_items) AS elem
    GROUP BY (elem->>'id')::uuid
    ORDER BY p_id ASC
  LOOP
    SELECT id, name, description
    INTO v_product
    FROM public.products
    WHERE id = v_item.p_id AND store_id = _store_id;

    SELECT count(*)::int INTO v_stock_tag_count
    FROM regexp_matches(COALESCE(v_product.description, ''), '\[[^\]]*stock[^\]]*\]', 'gi');

    IF v_stock_tag_count = 1 AND COALESCE(v_product.description, '') ~ '\[STOCK:(-?\d{1,9}|unlimited)\]' THEN
      v_stock_match := regexp_matches(v_product.description, '\[STOCK:(-?\d{1,9}|unlimited)\]');
      IF v_stock_match IS NOT NULL AND array_length(v_stock_match, 1) >= 1 THEN
        v_stock_val := v_stock_match[1];
        IF v_stock_val <> 'unlimited' THEN
          v_stock_num := v_stock_val::int;
          -- Garante que o stock nunca fica negativo
          v_new_stock := GREATEST(0, v_stock_num - v_item.total_qty);
          v_new_in_stock := (v_new_stock > 0);

          -- Preservar o texto limpo da descrição e gravar o novo marcador canónico
          v_clean_desc := btrim(regexp_replace(COALESCE(v_product.description, ''), '\[[^\]]*stock[^\]]*\]', '', 'gi'));
          IF v_clean_desc = '' THEN
            v_new_desc := '[STOCK:' || v_new_stock::text || ']';
          ELSE
            v_new_desc := v_clean_desc || ' [STOCK:' || v_new_stock::text || ']';
          END IF;

          UPDATE public.products
          SET description = v_new_desc,
              in_stock = v_new_in_stock,
              updated_at = pg_catalog.now()
          WHERE id = v_product.id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 2.2 Preparar lista sanitizada com preços oficiais da base de dados e total seguro
  FOR v_item IN 
    SELECT 
      (elem->>'id')::uuid AS p_id,
      SUM((elem->>'qty')::int)::int AS total_qty
    FROM jsonb_array_elements(_items) AS elem
    GROUP BY (elem->>'id')::uuid
    ORDER BY p_id ASC
  LOOP
    SELECT id, name, price
    INTO v_product
    FROM public.products
    WHERE id = v_item.p_id AND store_id = _store_id;

    v_total := v_total + (v_product.price * v_item.total_qty);

    v_sanitized_items := v_sanitized_items || jsonb_build_object(
      'id', v_product.id::text,
      'name', v_product.name,
      'price', v_product.price,
      'qty', v_item.total_qty
    );
  END LOOP;

  -- 2.3 Gravar a encomenda em public.orders
  INSERT INTO public.orders (
    store_id,
    customer_name,
    customer_phone,
    items,
    total,
    currency,
    created_at
  ) VALUES (
    _store_id,
    v_clean_name,
    v_clean_phone,
    v_sanitized_items,
    v_total,
    v_currency,
    pg_catalog.now()
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'total', v_total,
    'items', v_sanitized_items
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Registo interno para diagnóstico administrativo sem expor detalhes internos ao cliente público.
    -- No PostgreSQL, entrar no bloco de excepção reverte automaticamente quaisquer alterações da subtransacção.
    RAISE WARNING 'create_public_order falhou para store_id %: % (SQLSTATE: %)', _store_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Ocorreu um erro interno ao processar a encomenda. Por favor, tente novamente.',
      'code', 'TRANSACTION_FAILED'
    );
END;
$$;

-- Permissões mínimas necessárias
REVOKE ALL ON FUNCTION public.create_public_order(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, text, jsonb, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_public_order IS 'Criação transaccional atómica de pedidos públicos com validação Two-Pass e dedução pessimista de stock.';
