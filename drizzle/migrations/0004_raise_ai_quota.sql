CREATE OR REPLACE FUNCTION public.consume_ai_quota(_kind text, _store_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_minute int; v_store_day int; v_user_day int;
  c_minute constant int := 10;
  c_store_day constant int := 200;
  c_user_day constant int := 500;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado' USING ERRCODE='42501'; END IF;
  IF _kind NOT IN ('image','text') THEN RAISE EXCEPTION 'Tipo invalido'; END IF;
  IF _store_id IS NOT NULL THEN
    IF NOT (has_role(v_uid,'admin') OR is_store_manager(v_uid,_store_id)) THEN
      RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501'; END IF;
  ELSIF NOT (has_role(v_uid,'admin') OR EXISTS(SELECT 1 FROM store_managers WHERE user_id=v_uid)) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));
  SELECT count(*) INTO v_minute FROM ai_usage WHERE user_id=v_uid AND created_at > now()-interval '1 minute';
  IF v_minute >= c_minute THEN RETURN jsonb_build_object('allowed',false,'reason','minute'); END IF;
  SELECT count(*) INTO v_user_day FROM ai_usage WHERE user_id=v_uid AND created_at > now()-interval '1 day';
  IF v_user_day >= c_user_day THEN RETURN jsonb_build_object('allowed',false,'reason','user_day'); END IF;
  IF _store_id IS NOT NULL THEN
    SELECT count(*) INTO v_store_day FROM ai_usage WHERE store_id=_store_id AND created_at > now()-interval '1 day';
    IF v_store_day >= c_store_day THEN RETURN jsonb_build_object('allowed',false,'reason','store_day'); END IF;
  END IF;
  INSERT INTO ai_usage(user_id,store_id,kind) VALUES (v_uid,_store_id,_kind);
  RETURN jsonb_build_object('allowed',true);
END $$;