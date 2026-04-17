DROP TRIGGER IF EXISTS on_auth_user_created_assign_default_role ON auth.users;

CREATE TRIGGER on_auth_user_created_assign_default_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();