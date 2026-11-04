CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins e gestores veem uso de IA" ON public.ai_usage FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR (store_id IS NOT NULL AND is_store_manager(auth.uid(), store_id)) OR user_id = auth.uid());
CREATE INDEX ai_usage_user_time ON public.ai_usage(user_id, created_at);
CREATE INDEX ai_usage_store_time ON public.ai_usage(store_id, created_at);

CREATE OR REPLACE FUNCTION public.consume_ai_quota(_kind text, _store_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_minute int; v_store_day int; v_user_day int;
  c_minute constant int := 10;
  c_store_day constant int := 100;
  c_user_day constant int := 200;
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
REVOKE ALL ON FUNCTION public.consume_ai_quota(text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text,uuid) TO authenticated;