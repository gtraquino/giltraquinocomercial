-- Migração para criação e associação atómica de gestores de loja sem necessidade de email/confirmação
-- Previne devoluções de email (bounces), elimina o erro de "email not confirmed" e permite acesso imediato com utilizador e senha.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Confirmar utilizadores pendentes para desbloquear gestores existentes
UPDATE auth.users 
SET email_confirmed_at = COALESCE(email_confirmed_at, now()) 
WHERE email_confirmed_at IS NULL;

-- 2. Função de criação ou associação de gestor com senha direta e email já confirmado
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
  -- Verificar autenticação
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  -- Verificar se o chamador é Administrador ou Proprietário da Loja
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

  -- Obter hash da senha
  hashed_pwd := extensions.crypt(clean_password, extensions.gen_salt('bf'));

  -- Verificar se o utilizador já existe em auth.users
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE lower(email) = clean_email 
  LIMIT 1;

  IF target_user_id IS NULL THEN
    target_user_id := gen_random_uuid();
    is_new := true;

    -- Inserir novo utilizador diretamente pré-confirmado (sem necessidade de emails)
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

    -- Registar identidade para o utilizador
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

    -- Atribuir role 'user'
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'user'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Utilizador existente: atualizar palavra-passe e garantir que o email está confirmado
    UPDATE auth.users
    SET encrypted_password = hashed_pwd,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  -- Associar à loja
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
