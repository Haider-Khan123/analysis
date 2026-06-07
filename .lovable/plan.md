
## 1. Database (single migration)

New tables (all RLS-enabled, with GRANTs to authenticated + service_role):

- `attendance_records` — one row per (student, date)
  - `student_id`, `class_id`, `section_id`, `school_id`, `attendance_date`, `status` (enum: present/absent/late/leave), `remarks`, `marked_by` (teacher user_id), `is_draft`, `created_at`, `updated_at`
  - Unique constraint: `(student_id, attendance_date)`
- `attendance_settings` — per school: `low_attendance_threshold` (default 75), edit cutoff is "same day" (fixed for now; field stored for future)
- `notifications` — `user_id` (recipient), `type`, `title`, `body`, `student_id`, `is_read`, `created_at`
- Enum: `attendance_status`

RLS:
- Teachers can SELECT/INSERT/UPDATE attendance only for sections they're assigned to (via security-definer function `is_teacher_of_section(section_id)`).
- Same-day edit only; after that → admin-only update.
- Admins manage all in their school.
- Parents SELECT attendance only for their linked students (`is_parent_of_student`).
- Notifications: recipient sees own; service_role inserts.

Realtime enabled on `notifications`.

## 2. Server functions (`src/lib/attendance.functions.ts`)

- `getEnrolledStudents({ classId, sectionId })` — teacher-scoped
- `getAttendanceForDate({ sectionId, date })` — returns existing records merged with roster
- `saveAttendance({ sectionId, date, records[], isDraft })` — upserts; same-day rule enforced; triggers notifications on absent/late and consecutive-3
- `getAttendanceHistory({ filters })`
- `getStudentAnalytics({ studentId, from, to })`
- `getClassAnalytics({ classId, sectionId, from, to })`
- `getLowAttendanceStudents({ threshold })`
- Parent: `getMyChildrenAttendance()`, `getChildAttendanceSummary({ studentId, from, to })`
- Notifications: `getMyNotifications()`, `markNotificationRead(id)`

## 3. Parent role wiring

- Add `parent` to sidebar nav resolution
- Parent dashboard route: `_authenticated.parent-dashboard.tsx` (or branch in dashboard) with attendance summary cards per linked child
- On parent creation, allow linking `user_id` (existing column) — admins invite parent via existing User Management flow with role `parent`
- Parents only see: Dashboard + Attendance (children) + Notifications

## 4. New routes

```
_authenticated.attendance.tsx                 (layout with subnav)
_authenticated.attendance.index.tsx           → redirect to mark
_authenticated.attendance.mark.tsx            Mark Attendance (teacher)
_authenticated.attendance.history.tsx         History
_authenticated.attendance.reports.tsx         Reports (daily/monthly/student/low)
_authenticated.attendance.settings.tsx        Admin: threshold
_authenticated.parent.attendance.tsx          Parent: children summary + history
_authenticated.notifications.tsx              In-app notifications list
```

## 5. Sidebar updates (`_authenticated.tsx`)

Add **Attendance Management** with submenu (Mark / History / Reports / Settings).
- Admin: sees all submenus
- Teacher: Mark, History, Reports (settings hidden)
- Parent: hidden; instead sees "My Children" attendance link
- Bell icon header with unread notification count (realtime subscription)

## 6. Notifications engine

In `saveAttendance` server fn (admin client), after upsert:
- For each absent/late record, insert notification for each linked parent (`user_id`)
- Check last 3 school-day records per absent student → if all absent, insert "consecutive absence" notification

## 7. UI details

- Mark Attendance: class+section+date pickers, table with radio group per student (Present/Absent/Late/Leave) + remarks, "Bulk Present" button, Save Draft + Submit buttons
- Defaults all to Present
- Same-day edit allowed; otherwise table is read-only with badge "Locked — admin only"
- Reports use existing date-picker + Table; CSV export via simple client-side blob

## Out of scope (this pass)

- SMS/email channels (Phase 2 per spec)
- Admin approval workflow UI for post-cutoff edits — admins can edit directly via RLS; explicit approval queue deferred
- Attendance analytics charts beyond numeric summaries (kept tabular to ship in one pass)

Confirm and I'll execute the migration first, then build the code in parallel batches.
