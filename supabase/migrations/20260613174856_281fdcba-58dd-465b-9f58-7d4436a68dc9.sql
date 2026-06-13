
-- ENUMS
CREATE TYPE public.homework_scope AS ENUM ('class','section');
CREATE TYPE public.progress_type AS ENUM ('observation','behavior','participation','academic');
CREATE TYPE public.behavior_rating AS ENUM ('excellent','good','average','needs_improvement');
CREATE TYPE public.participation_level AS ENUM ('highly_active','active','moderate','passive');

-- HOMEWORK
CREATE TABLE public.homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  subject text NOT NULL,
  title text NOT NULL,
  description text,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  scope public.homework_scope NOT NULL DEFAULT 'section',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework TO authenticated;
GRANT ALL ON public.homework TO service_role;
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homework_admin_all" ON public.homework FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND school_id = public.current_school_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') AND school_id = public.current_school_id());

CREATE POLICY "homework_teacher_select" ON public.homework FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (section_id IS NOT NULL AND public.is_teacher_of_section(section_id))
  );

CREATE POLICY "homework_teacher_insert" ON public.homework FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (section_id IS NULL OR public.is_teacher_of_section(section_id))
  );

CREATE POLICY "homework_teacher_update" ON public.homework FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "homework_teacher_delete" ON public.homework FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "homework_parent_select" ON public.homework FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.parents p ON p.id = ps.parent_id
      JOIN public.students s ON s.id = ps.student_id
      WHERE p.user_id = auth.uid()
        AND (
          (homework.section_id IS NOT NULL AND s.section_id = homework.section_id)
          OR (homework.section_id IS NULL AND s.class_id = homework.class_id)
        )
    )
  );

CREATE TRIGGER homework_set_updated_at BEFORE UPDATE ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_homework_section_due ON public.homework(section_id, due_date);
CREATE INDEX idx_homework_class_due ON public.homework(class_id, due_date);
CREATE INDEX idx_homework_school_due ON public.homework(school_id, due_date);

-- HOMEWORK ATTACHMENTS
CREATE TABLE public.homework_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_attachments TO authenticated;
GRANT ALL ON public.homework_attachments TO service_role;
ALTER TABLE public.homework_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hw_att_select" ON public.homework_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homework h WHERE h.id = homework_id));
CREATE POLICY "hw_att_insert" ON public.homework_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND EXISTS (SELECT 1 FROM public.homework h WHERE h.id = homework_id AND h.created_by = auth.uid()));
CREATE POLICY "hw_att_delete" ON public.homework_attachments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homework h WHERE h.id = homework_id AND h.created_by = auth.uid()));

-- STUDENT PROGRESS
CREATE TABLE public.student_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  teacher_user_id uuid NOT NULL,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  type public.progress_type NOT NULL,
  title text,
  notes text,
  subject text,
  behavior public.behavior_rating,
  participation public.participation_level,
  strengths text,
  improvements text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_progress TO authenticated;
GRANT ALL ON public.student_progress TO service_role;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_admin_all" ON public.student_progress FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND school_id = public.current_school_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') AND school_id = public.current_school_id());

CREATE POLICY "sp_teacher_select" ON public.student_progress FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid() OR (section_id IS NOT NULL AND public.is_teacher_of_section(section_id)));

CREATE POLICY "sp_teacher_insert" ON public.student_progress FOR INSERT TO authenticated
  WITH CHECK (teacher_user_id = auth.uid() AND (section_id IS NULL OR public.is_teacher_of_section(section_id)));

CREATE POLICY "sp_teacher_update" ON public.student_progress FOR UPDATE TO authenticated
  USING (teacher_user_id = auth.uid()) WITH CHECK (teacher_user_id = auth.uid());

CREATE POLICY "sp_teacher_delete" ON public.student_progress FOR DELETE TO authenticated
  USING (teacher_user_id = auth.uid());

CREATE POLICY "sp_parent_select" ON public.student_progress FOR SELECT TO authenticated
  USING (public.is_parent_of_student(student_id));

CREATE TRIGGER sp_set_updated_at BEFORE UPDATE ON public.student_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sp_student_date ON public.student_progress(student_id, record_date DESC);
CREATE INDEX idx_sp_section_date ON public.student_progress(section_id, record_date DESC);
CREATE INDEX idx_sp_teacher_date ON public.student_progress(teacher_user_id, record_date DESC);
