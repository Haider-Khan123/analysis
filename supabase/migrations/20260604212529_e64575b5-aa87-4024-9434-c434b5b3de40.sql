CREATE POLICY "admin deletes school" ON public.schools
  FOR DELETE TO authenticated
  USING (id = public.current_school_id() AND public.has_role(auth.uid(), 'admin'::public.app_role));