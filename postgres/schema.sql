-- ClassFlow — PostgreSQL schema (PostgreSQL 15+, tested on Neon / Postgres 18)
--
-- Converted from mysql/schema.sql:
--   * CHAR(36) UUID()                    -> uuid DEFAULT gen_random_uuid()
--   * DATETIME(3)                        -> timestamptz(3)
--   * JSON                               -> jsonb
--   * ENUM(...) columns                  -> Postgres enum types
--   * ON UPDATE CURRENT_TIMESTAMP(3)     -> set_updated_at() trigger
--   * parent_students.primary_student_id -> partial unique index (student_id) WHERE is_primary
--   * case-insensitive email uniqueness  -> unique indexes on lower(email)
--
-- Row Level Security is not used. Every server function authorises the caller
-- explicitly before touching data (see src/lib/*.functions.ts).
--
-- Load once into an empty database:  psql "$DATABASE_URL" -f postgres/schema.sql

SET client_min_messages = warning;

-- ---------------------------------------------------------------- enum types
CREATE TYPE app_role AS ENUM ('admin','teacher','parent','super_admin');
CREATE TYPE attendance_status AS ENUM ('present','absent','late','leave');
CREATE TYPE homework_scope AS ENUM ('class','section');
CREATE TYPE progress_type AS ENUM ('observation','behavior','participation','academic');
CREATE TYPE behavior_rating AS ENUM ('excellent','good','average','needs_improvement');
CREATE TYPE participation_level AS ENUM ('highly_active','active','moderate','passive');
CREATE TYPE announcement_type AS ENUM ('school_wide','class_specific');
CREATE TYPE announcement_category AS ENUM ('school_closure','public_holiday','sports_day','parent_teacher_meeting',
  'exam_schedule','homework_reminder','class_test','field_trip','project_submission','other');
CREATE TYPE announcement_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE announcement_status AS ENUM ('draft','scheduled','published','expired','archived');

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- auth
CREATE TABLE auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  encrypted_password varchar(255),
  raw_user_meta_data jsonb,
  email_confirmed_at timestamptz(3),
  last_sign_in_at timestamptz(3),
  -- Bumped to revoke every issued access token for this user (sign out everywhere).
  session_version integer NOT NULL DEFAULT 0,
  recovery_token_hash char(64),
  recovery_sent_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_users_email_uniq ON auth_users (lower(email));
CREATE INDEX auth_users_recovery_idx ON auth_users (recovery_token_hash);

-- ---------------------------------------------------------------- schools / users
CREATE TABLE schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  address text,
  phone varchar(64),
  email varchar(255),
  logo_url text,
  branch varchar(255),
  created_by uuid NOT NULL,
  is_suspended boolean NOT NULL DEFAULT false,
  suspended_at timestamptz(3),
  suspended_by uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  full_name varchar(255) NOT NULL,
  email varchar(255) NOT NULL,
  phone varchar(64),
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_school ON profiles (school_id);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT: a platform-wide role (school_id NULL) can only be granted once.
  CONSTRAINT user_roles_user_role_school_uniq UNIQUE NULLS NOT DISTINCT (user_id, role, school_id)
);
CREATE INDEX idx_user_roles_user ON user_roles (user_id);

-- ---------------------------------------------------------------- classes / people
CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  grade_level varchar(255),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX classes_school_idx ON classes (school_id);

CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  teacher_id uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX sections_class_idx ON sections (class_id);
CREATE INDEX sections_school_idx ON sections (school_id);

CREATE TABLE teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  full_name varchar(255) NOT NULL,
  email varchar(255),
  phone varchar(64),
  subject varchar(255),
  employee_id varchar(100),
  first_name varchar(255),
  last_name varchar(255),
  gender varchar(32),
  date_of_birth date,
  cnic varchar(64),
  address text,
  joining_date date,
  designation varchar(255),
  department varchar(255),
  status varchar(32) NOT NULL DEFAULT 'active',
  photo_url text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT teachers_school_cnic_uniq UNIQUE (school_id, cnic),
  CONSTRAINT teachers_school_employee_id_uniq UNIQUE (school_id, employee_id)
);
CREATE INDEX teachers_school_idx ON teachers (school_id);
CREATE INDEX teachers_user_idx ON teachers (user_id);
CREATE UNIQUE INDEX teachers_school_email_uniq ON teachers (school_id, lower(email));

ALTER TABLE sections
  ADD CONSTRAINT sections_teacher_fk FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL;

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  full_name varchar(255) NOT NULL,
  admission_number varchar(100),
  date_of_birth date,
  gender varchar(32),
  enrollment_date date DEFAULT CURRENT_DATE,
  notes text,
  attendance_id varchar(100),
  first_name varchar(255),
  last_name varchar(255),
  photo_url text,
  admission_date date,
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT students_school_admission_uidx UNIQUE (school_id, admission_number)
);
CREATE INDEX students_school_idx ON students (school_id);
CREATE INDEX students_class_idx ON students (class_id);
CREATE INDEX students_section_idx ON students (section_id);

CREATE TABLE parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  full_name varchar(255) NOT NULL,
  email varchar(255),
  phone varchar(64),
  relationship varchar(64),
  parent_id varchar(100),
  first_name varchar(255),
  last_name varchar(255),
  photo_url text,
  cnic varchar(64),
  occupation varchar(255),
  alternate_phone varchar(64),
  address text,
  city varchar(255),
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT parents_school_parent_id_uidx UNIQUE (school_id, parent_id)
);
CREATE INDEX parents_school_idx ON parents (school_id);
CREATE INDEX parents_user_idx ON parents (user_id);

CREATE TABLE parent_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship_type varchar(64) NOT NULL DEFAULT 'guardian',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT parent_students_pair_uidx UNIQUE (parent_id, student_id)
);
CREATE UNIQUE INDEX parent_students_primary_uidx ON parent_students (student_id) WHERE is_primary;
CREATE INDEX idx_parent_students_student ON parent_students (student_id);

CREATE TABLE section_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT section_teachers_uniq UNIQUE (section_id, teacher_id)
);
CREATE INDEX section_teachers_teacher_idx ON section_teachers (teacher_id);

CREATE TABLE teacher_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  subject varchar(255) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT teacher_subjects_uniq UNIQUE (teacher_id, subject)
);

CREATE TABLE teacher_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  class_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT teacher_classes_uniq UNIQUE (teacher_id, class_id)
);
CREATE INDEX teacher_classes_class_idx ON teacher_classes (class_id);

CREATE TABLE class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  class_id uuid NOT NULL,
  section_id uuid NOT NULL,
  school_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT class_teachers_uniq UNIQUE (class_id, section_id)
);
CREATE INDEX class_teachers_teacher_idx ON class_teachers (teacher_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_id uuid,
  actor_name varchar(255),
  entity varchar(64) NOT NULL,
  entity_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  diff jsonb,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id, created_at DESC);

CREATE TABLE student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  full_name varchar(255) NOT NULL,
  relationship varchar(64) NOT NULL,
  phone varchar(64) NOT NULL,
  email varchar(255),
  address text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX student_guardians_student_idx ON student_guardians (student_id);

-- ---------------------------------------------------------------- attendance
CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  section_id uuid NOT NULL,
  student_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status attendance_status NOT NULL DEFAULT 'present',
  remarks text,
  marked_by uuid,
  is_draft boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT attendance_student_date_uniq UNIQUE (student_id, attendance_date)
);
CREATE INDEX idx_att_section_date ON attendance_records (section_id, attendance_date);
CREATE INDEX idx_att_school_date ON attendance_records (school_id, attendance_date);

CREATE TABLE attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  low_attendance_threshold numeric(5,2) NOT NULL DEFAULT 75.00,
  edit_cutoff_hours integer NOT NULL DEFAULT 24,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT attendance_settings_school_uniq UNIQUE (school_id)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid,
  type varchar(64) NOT NULL,
  title varchar(500) NOT NULL,
  body text,
  student_id uuid,
  metadata jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_unread ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_metadata ON notifications USING gin (metadata jsonb_path_ops);

-- ---------------------------------------------------------------- homework / progress
CREATE TABLE homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
  subject varchar(255) NOT NULL,
  title varchar(500) NOT NULL,
  description text,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  scope homework_scope NOT NULL DEFAULT 'section',
  created_by uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_homework_section_due ON homework (section_id, due_date);
CREATE INDEX idx_homework_class_due ON homework (class_id, due_date);
CREATE INDEX idx_homework_school_due ON homework (school_id, due_date);

CREATE TABLE homework_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  file_name varchar(500) NOT NULL,
  file_path varchar(1024) NOT NULL,
  mime_type varchar(255),
  size_bytes integer,
  uploaded_by uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX homework_attachments_hw_idx ON homework_attachments (homework_id);

CREATE TABLE student_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  teacher_user_id uuid NOT NULL,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  type progress_type NOT NULL,
  title varchar(500),
  notes text,
  subject varchar(255),
  behavior behavior_rating,
  participation participation_level,
  strengths text,
  improvements text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_sp_student_date ON student_progress (student_id, record_date DESC);
CREATE INDEX idx_sp_section_date ON student_progress (section_id, record_date DESC);
CREATE INDEX idx_sp_teacher_date ON student_progress (teacher_user_id, record_date DESC);

-- ---------------------------------------------------------------- announcements
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  type announcement_type NOT NULL,
  title varchar(500) NOT NULL,
  description text NOT NULL,
  category announcement_category NOT NULL DEFAULT 'other',
  priority announcement_priority NOT NULL DEFAULT 'medium',
  status announcement_status NOT NULL DEFAULT 'draft',
  publish_at timestamptz(3),
  expires_at timestamptz(3),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_school_status ON announcements (school_id, status);
CREATE INDEX idx_ann_school_publish ON announcements (school_id, publish_at DESC);
CREATE INDEX idx_ann_section ON announcements (section_id);
CREATE INDEX idx_ann_class ON announcements (class_id);

CREATE TABLE announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  file_name varchar(500) NOT NULL,
  file_path varchar(1024) NOT NULL,
  mime_type varchar(255),
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_att_ann ON announcement_attachments (announcement_id);

CREATE TABLE announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT announcement_reads_uniq UNIQUE (announcement_id, user_id)
);
CREATE INDEX idx_ann_reads_user ON announcement_reads (user_id);

-- ---------------------------------------------------------------- chat
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  last_message_at timestamptz(3),
  last_message_preview text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT conversations_uniq UNIQUE (teacher_id, parent_id, student_id)
);
CREATE INDEX idx_conv_teacher ON conversations (teacher_id, last_message_at DESC);
CREATE INDEX idx_conv_parent ON conversations (parent_id, last_message_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  sender_role varchar(16) NOT NULL CONSTRAINT messages_sender_role_chk CHECK (sender_role IN ('teacher','parent')),
  body text,
  delivered_at timestamptz(3) NOT NULL DEFAULT now(),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv_created ON messages (conversation_id, created_at DESC);

CREATE TABLE message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT message_reads_uniq UNIQUE (message_id, user_id)
);
CREATE INDEX idx_reads_user ON message_reads (user_id);

CREATE TABLE message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_name varchar(500) NOT NULL,
  file_path varchar(1024) NOT NULL,
  mime_type varchar(255) NOT NULL,
  size bigint NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX message_attachments_msg_idx ON message_attachments (message_id);

-- ---------------------------------------------------------------- file storage metadata
CREATE TABLE storage_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id varchar(100) NOT NULL,
  name varchar(512) NOT NULL,
  owner uuid,
  mime_type varchar(255),
  size bigint,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT storage_objects_bucket_name_uniq UNIQUE (bucket_id, name)
);

-- ---------------------------------------------------------------- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
     WHERE c.table_schema = current_schema() AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t || '_set_updated_at', t);
  END LOOP;
END;
$$;
