
-- Enum
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present','absent','late','leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================
-- attendance_records
-- =========================
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  section_id uuid NOT NULL,
  student_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  remarks text,
  marked_by uuid,
  is_draft boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
CREATE INDEX idx_att_section_date ON public.attendance_records(section_id, attendance_date);
CREATE INDEX idx_att_student_date ON public.attendance_records(student_id, attendance_date);
CREATE INDEX idx_att_school_date ON public.attendance_records(school_id, attendance_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_att_updated_at BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- attendance_settings
-- =========================
CREATE TABLE public.attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE,
  low_attendance_threshold numeric(5,2) NOT NULL DEFAULT 75.00,
  edit_cutoff_hours integer NOT NULL DEFAULT 24, -- reserved for future use
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_settings TO authenticated;
GRANT ALL ON public.attendance_settings TO service_role;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_att_settings_updated_at BEFORE UPDATE ON public.attendance_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- notifications
-- =========================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  student_id uuid,
  metadata jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_unread ON public.notifications(user_id, is_read, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- =========================
-- Security-definer helpers
-- =========================
CREATE OR REPLACE FUNCTION public.is_teacher_of_section(_section_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teachers t
    LEFT JOIN public.section_teachers st ON st.teacher_id = t.id
    LEFT JOIN public.class_teachers ct ON ct.teacher_id = t.id
    WHERE t.user_id = auth.uid()
      AND (st.section_id = _section_id OR ct.section_id = _section_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_parent_of_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.parents p ON p.id = ps.parent_id
    WHERE ps.student_id = _student_id
      AND p.user_id = auth.uid()
  );
$$;

-- =========================
-- attendance_records policies
-- =========================
-- Admin manage all in school
CREATE POLICY "admin manages attendance" ON public.attendance_records
FOR ALL TO authenticated
USING (school_id = current_school_id() AND has_role(auth.uid(), 'admin'))
WITH CHECK (school_id = current_school_id() AND has_role(auth.uid(), 'admin'));

-- Teacher: view records for sections they teach
CREATE POLICY "teacher views section attendance" ON public.attendance_records
FOR SELECT TO authenticated
USING (public.is_teacher_of_section(section_id));

-- Teacher: insert for sections they teach
CREATE POLICY "teacher inserts attendance" ON public.attendance_records
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'teacher')
  AND public.is_teacher_of_section(section_id)
  AND attendance_date = (now() AT TIME ZONE 'UTC')::date
);

-- Teacher: update same-day only
CREATE POLICY "teacher updates same day" ON public.attendance_records
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'teacher')
  AND public.is_teacher_of_section(section_id)
  AND attendance_date = (now() AT TIME ZONE 'UTC')::date
)
WITH CHECK (
  public.is_teacher_of_section(section_id)
  AND attendance_date = (now() AT TIME ZONE 'UTC')::date
);

-- Parent: view their child's records
CREATE POLICY "parent views child attendance" ON public.attendance_records
FOR SELECT TO authenticated
USING (public.is_parent_of_student(student_id));

-- =========================
-- attendance_settings policies
-- =========================
CREATE POLICY "admin manages att settings" ON public.attendance_settings
FOR ALL TO authenticated
USING (school_id = current_school_id() AND has_role(auth.uid(), 'admin'))
WITH CHECK (school_id = current_school_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "school views att settings" ON public.attendance_settings
FOR SELECT TO authenticated
USING (school_id = current_school_id());

-- =========================
-- notifications policies
-- =========================
CREATE POLICY "user views own notifications" ON public.notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "user updates own notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
