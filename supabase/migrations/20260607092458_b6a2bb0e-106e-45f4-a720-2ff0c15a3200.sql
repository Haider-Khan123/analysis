
REVOKE EXECUTE ON FUNCTION public.is_teacher_of_section(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_parent_of_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_section(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent_of_student(uuid) TO authenticated;
