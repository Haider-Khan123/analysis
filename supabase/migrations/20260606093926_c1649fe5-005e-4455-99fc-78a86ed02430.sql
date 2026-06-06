-- 1) Extend teachers
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS cnic text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS photo_url text;

CREATE UNIQUE INDEX IF NOT EXISTS teachers_school_cnic_uniq
  ON public.teachers (school_id, cnic) WHERE cnic IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_school_email_uniq
  ON public.teachers (school_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_school_employee_id_uniq
  ON public.teachers (school_id, employee_id) WHERE employee_id IS NOT NULL;

-- 2) teacher_subjects
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, subject)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO authenticated;
GRANT ALL ON public.teacher_subjects TO service_role;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members view teacher_subjects" ON public.teacher_subjects
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_subjects.teacher_id AND t.school_id = current_school_id())
  );
CREATE POLICY "admin manages teacher_subjects" ON public.teacher_subjects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_subjects.teacher_id AND t.school_id = current_school_id()))
  WITH CHECK (has_role(auth.uid(), 'admin') AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_subjects.teacher_id AND t.school_id = current_school_id()));

-- 3) teacher_classes
CREATE TABLE IF NOT EXISTS public.teacher_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  class_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_classes TO authenticated;
GRANT ALL ON public.teacher_classes TO service_role;
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members view teacher_classes" ON public.teacher_classes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_classes.teacher_id AND t.school_id = current_school_id())
  );
CREATE POLICY "admin manages teacher_classes" ON public.teacher_classes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_classes.teacher_id AND t.school_id = current_school_id()))
  WITH CHECK (has_role(auth.uid(), 'admin') AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_classes.teacher_id AND t.school_id = current_school_id()));

-- 4) class_teachers (homeroom — one teacher per class+section)
CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  class_id uuid NOT NULL,
  section_id uuid NOT NULL,
  school_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, section_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members view class_teachers" ON public.class_teachers
  FOR SELECT TO authenticated USING (school_id = current_school_id());
CREATE POLICY "admin manages class_teachers" ON public.class_teachers
  FOR ALL TO authenticated
  USING (school_id = current_school_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (school_id = current_school_id() AND has_role(auth.uid(), 'admin'));

-- 5) audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_id uuid,
  actor_name text,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity, entity_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin views audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (school_id = current_school_id() AND has_role(auth.uid(), 'admin'));