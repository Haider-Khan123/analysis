
-- Extend parents with new profile fields
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS parent_id text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS cnic text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS alternate_phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Unique parent_id within a school (nulls allowed)
CREATE UNIQUE INDEX IF NOT EXISTS parents_school_parent_id_uidx
  ON public.parents (school_id, parent_id) WHERE parent_id IS NOT NULL;

-- Extend parent_students with relationship + primary flag
ALTER TABLE public.parent_students
  ADD COLUMN IF NOT EXISTS relationship_type text NOT NULL DEFAULT 'guardian',
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Only one primary guardian per student
CREATE UNIQUE INDEX IF NOT EXISTS parent_students_primary_uidx
  ON public.parent_students (student_id) WHERE is_primary = true;

-- Prevent duplicate parent-student links
CREATE UNIQUE INDEX IF NOT EXISTS parent_students_pair_uidx
  ON public.parent_students (parent_id, student_id);
