CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key
ON public.user_roles (user_id, role);