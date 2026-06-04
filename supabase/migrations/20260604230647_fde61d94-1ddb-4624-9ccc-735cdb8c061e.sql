GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon, service_role;