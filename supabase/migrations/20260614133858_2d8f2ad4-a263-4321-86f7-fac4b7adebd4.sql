
-- ============ ENUMS ============
CREATE TYPE public.announcement_type AS ENUM ('school_wide', 'class_specific');
CREATE TYPE public.announcement_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.announcement_status AS ENUM ('draft', 'scheduled', 'published', 'expired', 'archived');
CREATE TYPE public.announcement_category AS ENUM (
  'school_closure','public_holiday','sports_day','parent_teacher_meeting','exam_schedule',
  'homework_reminder','class_test','field_trip','project_submission','other'
);

-- ============ announcements ============
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  type public.announcement_type NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category public.announcement_category NOT NULL DEFAULT 'other',
  priority public.announcement_priority NOT NULL DEFAULT 'medium',
  status public.announcement_status NOT NULL DEFAULT 'draft',
  publish_at timestamptz,
  expires_at timestamptz,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_school_status ON public.announcements(school_id, status);
CREATE INDEX idx_ann_school_publish ON public.announcements(school_id, publish_at DESC);
CREATE INDEX idx_ann_section ON public.announcements(section_id);
CREATE INDEX idx_ann_class ON public.announcements(class_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_admin_all" ON public.announcements
  TO authenticated USING (has_role(auth.uid(),'admin') AND school_id = current_school_id())
  WITH CHECK (has_role(auth.uid(),'admin') AND school_id = current_school_id());

CREATE POLICY "ann_teacher_insert" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      type = 'school_wide'
      OR (type = 'class_specific' AND section_id IS NOT NULL AND is_teacher_of_section(section_id))
    )
  );
CREATE POLICY "ann_teacher_update" ON public.announcements FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "ann_teacher_delete" ON public.announcements FOR DELETE TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "ann_teacher_select" ON public.announcements FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (type = 'school_wide' AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid() AND t.school_id = announcements.school_id))
    OR (type = 'class_specific' AND section_id IS NOT NULL AND is_teacher_of_section(section_id))
  );

CREATE POLICY "ann_parent_select" ON public.announcements FOR SELECT TO authenticated
  USING (
    (type = 'school_wide' AND EXISTS (
      SELECT 1 FROM public.parent_students ps
        JOIN public.parents p ON p.id = ps.parent_id
        JOIN public.students s ON s.id = ps.student_id
      WHERE p.user_id = auth.uid() AND s.school_id = announcements.school_id
    ))
    OR (type = 'class_specific' AND EXISTS (
      SELECT 1 FROM public.parent_students ps
        JOIN public.parents p ON p.id = ps.parent_id
        JOIN public.students s ON s.id = ps.student_id
      WHERE p.user_id = auth.uid()
        AND ((announcements.section_id IS NOT NULL AND s.section_id = announcements.section_id)
          OR (announcements.section_id IS NULL AND s.class_id = announcements.class_id))
    ))
  );

CREATE TRIGGER ann_set_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ announcement_attachments ============
CREATE TABLE public.announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_att_ann ON public.announcement_attachments(announcement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_attachments TO authenticated;
GRANT ALL ON public.announcement_attachments TO service_role;
ALTER TABLE public.announcement_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_att_select" ON public.announcement_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id));
CREATE POLICY "ann_att_insert" ON public.announcement_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id AND (a.created_by = auth.uid() OR has_role(auth.uid(),'admin'))));
CREATE POLICY "ann_att_delete" ON public.announcement_attachments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id AND (a.created_by = auth.uid() OR has_role(auth.uid(),'admin'))));

-- ============ announcement_reads ============
CREATE TABLE public.announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);
CREATE INDEX idx_ann_reads_user ON public.announcement_reads(user_id);

GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_reads_select_own" ON public.announcement_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "ann_reads_insert_own" ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============ storage policies for announcement-attachments bucket ============
CREATE POLICY "ann_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'announcement-attachments');
CREATE POLICY "ann_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'announcement-attachments' AND owner = auth.uid());
CREATE POLICY "ann_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'announcement-attachments' AND owner = auth.uid());
