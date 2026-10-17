-- ClassFlow — MySQL schema (MySQL 8.0.13+)
--
-- Consolidated from the Supabase/Postgres migrations in supabase/migrations/.
-- Conversion notes:
--   * uuid            -> CHAR(36) with DEFAULT (UUID())
--   * timestamptz     -> DATETIME(3), always stored in UTC (the app sets time_zone = '+00:00')
--   * jsonb           -> JSON
--   * Postgres enums  -> MySQL ENUM columns
--   * auth.users      -> auth_users (local email/password auth, see src/integrations/mysql/auth.server.ts)
--   * storage.objects -> storage_objects (files live on disk, see src/integrations/mysql/storage.server.ts)
--   * set_updated_at() triggers -> ON UPDATE CURRENT_TIMESTAMP(3)
--   * Partial unique indexes (WHERE col IS NOT NULL) -> plain unique indexes
--     (MySQL unique indexes already allow multiple NULLs; default collation is case-insensitive,
--     which covers the old lower(email) index).
--   * Row Level Security policies have no MySQL equivalent. Every server function already
--     authorises the caller explicitly before touching data (they used the service-role client),
--     and the few queries that ran from the browser now go through authorised server functions.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------- auth
CREATE TABLE IF NOT EXISTS auth_users (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  encrypted_password VARCHAR(255) NULL,
  raw_user_meta_data JSON NULL,
  email_confirmed_at DATETIME(3) NULL,
  last_sign_in_at DATETIME(3) NULL,
  -- Bumped to revoke every issued access token for this user (sign out everywhere).
  session_version INT NOT NULL DEFAULT 0,
  recovery_token_hash CHAR(64) NULL,
  recovery_sent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY auth_users_email_uniq (email),
  KEY auth_users_recovery_idx (recovery_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- schools / users
CREATE TABLE IF NOT EXISTS schools (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  logo_url TEXT NULL,
  branch VARCHAR(255) NULL,
  created_by CHAR(36) NOT NULL,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_at DATETIME(3) NULL,
  suspended_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NULL,
  school_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_profiles_school (school_id),
  CONSTRAINT profiles_user_fk FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  school_id CHAR(36) NULL,
  role ENUM('admin','teacher','parent','super_admin') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY user_roles_user_role_school_uniq (user_id, role, school_id),
  KEY idx_user_roles_user (user_id),
  CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- classes / people
CREATE TABLE IF NOT EXISTS classes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  grade_level VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY classes_school_idx (school_id),
  CONSTRAINT classes_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sections (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  class_id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  teacher_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY sections_class_idx (class_id),
  KEY sections_school_idx (school_id),
  CONSTRAINT sections_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT sections_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS teachers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  user_id CHAR(36) NULL,
  school_id CHAR(36) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  subject VARCHAR(255) NULL,
  employee_id VARCHAR(100) NULL,
  first_name VARCHAR(255) NULL,
  last_name VARCHAR(255) NULL,
  gender VARCHAR(32) NULL,
  date_of_birth DATE NULL,
  cnic VARCHAR(64) NULL,
  address TEXT NULL,
  joining_date DATE NULL,
  designation VARCHAR(255) NULL,
  department VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  photo_url TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY teachers_school_idx (school_id),
  KEY teachers_user_idx (user_id),
  UNIQUE KEY teachers_school_cnic_uniq (school_id, cnic),
  UNIQUE KEY teachers_school_email_uniq (school_id, email),
  UNIQUE KEY teachers_school_employee_id_uniq (school_id, employee_id),
  CONSTRAINT teachers_user_fk FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE SET NULL,
  CONSTRAINT teachers_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE sections
  ADD CONSTRAINT sections_teacher_fk FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS students (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  class_id CHAR(36) NULL,
  section_id CHAR(36) NULL,
  full_name VARCHAR(255) NOT NULL,
  admission_number VARCHAR(100) NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(32) NULL,
  enrollment_date DATE NULL DEFAULT (CURRENT_DATE),
  notes TEXT NULL,
  attendance_id VARCHAR(100) NULL,
  first_name VARCHAR(255) NULL,
  last_name VARCHAR(255) NULL,
  photo_url TEXT NULL,
  admission_date DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY students_school_idx (school_id),
  KEY students_class_idx (class_id),
  KEY students_section_idx (section_id),
  UNIQUE KEY students_school_admission_uidx (school_id, admission_number),
  CONSTRAINT students_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT students_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT students_section_fk FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS parents (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  user_id CHAR(36) NULL,
  school_id CHAR(36) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  relationship VARCHAR(64) NULL,
  parent_id VARCHAR(100) NULL,
  first_name VARCHAR(255) NULL,
  last_name VARCHAR(255) NULL,
  photo_url TEXT NULL,
  cnic VARCHAR(64) NULL,
  occupation VARCHAR(255) NULL,
  alternate_phone VARCHAR(64) NULL,
  address TEXT NULL,
  city VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY parents_school_idx (school_id),
  KEY parents_user_idx (user_id),
  UNIQUE KEY parents_school_parent_id_uidx (school_id, parent_id),
  CONSTRAINT parents_user_fk FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE SET NULL,
  CONSTRAINT parents_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS parent_students (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  parent_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  relationship_type VARCHAR(64) NOT NULL DEFAULT 'guardian',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  -- Emulates the Postgres partial index "UNIQUE (student_id) WHERE is_primary".
  primary_student_id CHAR(36) GENERATED ALWAYS AS (IF(is_primary, student_id, NULL)) VIRTUAL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY parent_students_pair_uidx (parent_id, student_id),
  UNIQUE KEY parent_students_primary_uidx (primary_student_id),
  KEY idx_parent_students_student (student_id),
  CONSTRAINT parent_students_parent_fk FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
  CONSTRAINT parent_students_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS section_teachers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  section_id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY section_teachers_uniq (section_id, teacher_id),
  KEY section_teachers_teacher_idx (teacher_id),
  CONSTRAINT section_teachers_section_fk FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  CONSTRAINT section_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  teacher_id CHAR(36) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY teacher_subjects_uniq (teacher_id, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS teacher_classes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  teacher_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY teacher_classes_uniq (teacher_id, class_id),
  KEY teacher_classes_class_idx (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS class_teachers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  teacher_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY class_teachers_uniq (class_id, section_id),
  KEY class_teachers_teacher_idx (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  actor_name VARCHAR(255) NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  action VARCHAR(64) NOT NULL,
  diff JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY audit_logs_entity_idx (entity, entity_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS student_guardians (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(64) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY student_guardians_student_idx (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- attendance
CREATE TABLE IF NOT EXISTS attendance_records (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','leave') NOT NULL DEFAULT 'present',
  remarks TEXT NULL,
  marked_by CHAR(36) NULL,
  is_draft BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY attendance_student_date_uniq (student_id, attendance_date),
  KEY idx_att_section_date (section_id, attendance_date),
  KEY idx_att_school_date (school_id, attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS attendance_settings (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  low_attendance_threshold DECIMAL(5,2) NOT NULL DEFAULT 75.00,
  edit_cutoff_hours INT NOT NULL DEFAULT 24,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY attendance_settings_school_uniq (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  school_id CHAR(36) NULL,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(500) NOT NULL,
  body TEXT NULL,
  student_id CHAR(36) NULL,
  metadata JSON NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notif_user_unread (user_id, is_read, created_at DESC),
  KEY idx_notifications_user_created (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- homework / progress
CREATE TABLE IF NOT EXISTS homework (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  section_id CHAR(36) NULL,
  subject VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  assigned_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  due_date DATE NOT NULL,
  scope ENUM('class','section') NOT NULL DEFAULT 'section',
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_homework_section_due (section_id, due_date),
  KEY idx_homework_class_due (class_id, due_date),
  KEY idx_homework_school_due (school_id, due_date),
  CONSTRAINT homework_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT homework_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT homework_section_fk FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS homework_attachments (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  homework_id CHAR(36) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  mime_type VARCHAR(255) NULL,
  size_bytes INT NULL,
  uploaded_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY homework_attachments_hw_idx (homework_id),
  CONSTRAINT homework_attachments_hw_fk FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS student_progress (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  class_id CHAR(36) NULL,
  section_id CHAR(36) NULL,
  teacher_user_id CHAR(36) NOT NULL,
  record_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  type ENUM('observation','behavior','participation','academic') NOT NULL,
  title VARCHAR(500) NULL,
  notes TEXT NULL,
  subject VARCHAR(255) NULL,
  behavior ENUM('excellent','good','average','needs_improvement') NULL,
  participation ENUM('highly_active','active','moderate','passive') NULL,
  strengths TEXT NULL,
  improvements TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_sp_student_date (student_id, record_date DESC),
  KEY idx_sp_section_date (section_id, record_date DESC),
  KEY idx_sp_teacher_date (teacher_user_id, record_date DESC),
  CONSTRAINT sp_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT sp_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT sp_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT sp_section_fk FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- announcements
CREATE TABLE IF NOT EXISTS announcements (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  type ENUM('school_wide','class_specific') NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  category ENUM('school_closure','public_holiday','sports_day','parent_teacher_meeting','exam_schedule',
                'homework_reminder','class_test','field_trip','project_submission','other') NOT NULL DEFAULT 'other',
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status ENUM('draft','scheduled','published','expired','archived') NOT NULL DEFAULT 'draft',
  publish_at DATETIME(3) NULL,
  expires_at DATETIME(3) NULL,
  class_id CHAR(36) NULL,
  section_id CHAR(36) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_ann_school_status (school_id, status),
  KEY idx_ann_school_publish (school_id, publish_at DESC),
  KEY idx_ann_section (section_id),
  KEY idx_ann_class (class_id),
  CONSTRAINT ann_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT ann_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT ann_section_fk FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS announcement_attachments (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  announcement_id CHAR(36) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  mime_type VARCHAR(255) NULL,
  size_bytes BIGINT NULL,
  uploaded_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ann_att_ann (announcement_id),
  CONSTRAINT ann_att_ann_fk FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS announcement_reads (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  announcement_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY announcement_reads_uniq (announcement_id, user_id),
  KEY idx_ann_reads_user (user_id),
  CONSTRAINT ann_reads_ann_fk FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- chat
CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NOT NULL,
  student_id CHAR(36) NULL,
  last_message_at DATETIME(3) NULL,
  last_message_preview TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY conversations_uniq (teacher_id, parent_id, student_id),
  KEY idx_conv_teacher (teacher_id, last_message_at DESC),
  KEY idx_conv_parent (parent_id, last_message_at DESC),
  CONSTRAINT conv_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT conv_teacher_fk FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT conv_parent_fk FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
  CONSTRAINT conv_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  sender_user_id CHAR(36) NOT NULL,
  sender_role VARCHAR(16) NOT NULL,
  body TEXT NULL,
  delivered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_messages_conv_created (conversation_id, created_at DESC),
  CONSTRAINT messages_sender_role_chk CHECK (sender_role IN ('teacher','parent')),
  CONSTRAINT messages_conv_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS message_reads (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  message_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY message_reads_uniq (message_id, user_id),
  KEY idx_reads_user (user_id),
  CONSTRAINT message_reads_msg_fk FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS message_attachments (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  message_id CHAR(36) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY message_attachments_msg_idx (message_id),
  CONSTRAINT message_attachments_msg_fk FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- file storage metadata
CREATE TABLE IF NOT EXISTS storage_objects (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  bucket_id VARCHAR(100) NOT NULL,
  name VARCHAR(512) NOT NULL,
  owner CHAR(36) NULL,
  mime_type VARCHAR(255) NULL,
  size BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY storage_objects_bucket_name_uniq (bucket_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
