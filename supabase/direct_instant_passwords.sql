-- ==============================================================================
-- SISTEMA DIRETO DE SENHAS E UTILIZADORES (SEM CONFIRMAÇÃO POR EMAIL)
-- ==============================================================================
-- 1. O gestor ou dono da loja cria ou define a senha logo no painel de acesso e confirma (sem email).
-- 2. O gestor ou dono da loja cria senhas para outros utilizadores/gestores (sem email).
-- 3. Todos os utilizadores novos e existentes ficam imediatamente confirmados (sem bloqueios).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Desbloquear todos os utilizadores existentes
UPDATE auth.users 
SET email_confirmed_at = COALESCE(email_confirmed_at, now()) 
WHERE email_confirmed_at IS NULL;

-- 2. Função pública: Criar utilizador ou definir/redefinir palavra-passe diretamente
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
  -- SEGURANÇA (SEC-01): Apenas administradores autenticados podem definir ou alterar palavras-passe diretamente
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

-- 3. Função para Gestor/Dono da Loja criar ou atribuir gestores com senha direta (sem email)
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
    clean_password := '12345678';
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

REVOKE ALL ON FUNCTION public.create_or_assign_manager(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_assign_manager(uuid, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
