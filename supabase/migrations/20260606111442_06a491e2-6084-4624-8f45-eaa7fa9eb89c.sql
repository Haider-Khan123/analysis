
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS attendance_id text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS admission_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS students_school_attendance_uidx
  ON public.students(school_id, attendance_id) WHERE attendance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_school_admission_uidx
  ON public.students(school_id, admission_number) WHERE admission_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  full_name text NOT NULL,
  relationship text NOT NULL,
  phone text NOT NULL,
  email text,
  address text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO authenticated;
GRANT ALL ON public.student_guardians TO service_role;

ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members view student_guardians"
  ON public.student_guardians FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_guardians.student_id AND s.school_id = current_school_id()));

CREATE POLICY "admin manages student_guardians"
  ON public.student_guardians FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_guardians.student_id AND s.school_id = current_school_id()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_guardians.student_id AND s.school_id = current_school_id()));

CREATE INDEX IF NOT EXISTS student_guardians_student_idx ON public.student_guardians(student_id);
