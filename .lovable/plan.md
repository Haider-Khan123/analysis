## Scope

Build two modules end-to-end in one pass, mirroring the existing Attendance module's patterns (server fns + RLS + sidebar submenu + parent view + in-app notifications):

1. **Homework Management**
2. **Student Progress Tracking**

## 1. Database (single migration)

### Homework
- `homework` table — `school_id`, `class_id`, `section_id`, `subject`, `title`, `description`, `assigned_date`, `due_date`, `created_by` (teacher user_id), `scope` ('class'|'section'), timestamps
- `homework_attachments` — `homework_id`, `file_name`, `file_path`, `mime_type`, `size`
- Storage bucket `homework-attachments` (private), with RLS on `storage.objects`

### Progress
- enum `progress_type`: `observation | behavior | participation | academic`
- enum `behavior_rating`: `excellent | good | average | needs_improvement`
- enum `participation_level`: `highly_active | active | moderate | passive`
- `student_progress` — `student_id`, `class_id`, `section_id`, `school_id`, `teacher_id` (user_id), `record_date`, `type`, `title`, `notes`, `subject` (academic only), `behavior_rating`, `participation_level`, `strengths`, `improvements`, timestamps

### Security
- All public-schema tables: GRANT to authenticated + service_role; enable RLS
- Reuse `is_teacher_of_section(section_id)` and `is_parent_of_student(student_id)` helpers
- Teachers: full CRUD scoped to their assigned sections / their own students
- Parents: SELECT only for linked students
- Admins: full access in their school
- Storage policies: teachers upload/delete only for sections they own; parents/teachers read for linked rows

## 2. Server functions

`src/lib/homework.functions.ts`
- `createHomework`, `updateHomework`, `deleteHomework`
- `listHomework({ filters })` — teacher/admin scoped
- `getHomework(id)` with attachments
- `getHomeworkForParent({ studentId?, subject?, from?, to? })`
- `getTeacherHomeworkWidgets()` — due today, recent, upcoming
- `getParentHomeworkWidgets()` — pending, upcoming, recent
- `uploadHomeworkAttachment` (signed URL) + `removeAttachment`
- On create → notify linked parents ("New Homework Assigned")
- Cron-style helper invoked on parent fetch: flag overdue/due tomorrow (no cron needed phase 1; surface via widget query)

`src/lib/progress.functions.ts`
- `createProgressRecord` (one fn, validates by type)
- `updateProgressRecord`, `deleteProgressRecord`
- `listProgress({ filters })`
- `getProgressForParent({ studentId, from, to })`
- `getTeacherProgressWidgets()` — recent observations, students needing attention (latest behavior = needs_improvement), recent remarks
- `getParentProgressWidgets({ studentId })` — recent feedback, latest academic, behavior summary
- Notify parents on insert; for behavior `needs_improvement` send "Significant Behavior Concern"

## 3. Routes

```
_authenticated.homework.tsx                  (layout)
_authenticated.homework.index.tsx            → redirect to list
_authenticated.homework.create.tsx           Create (teacher)
_authenticated.homework.list.tsx             List + edit/delete
_authenticated.homework.$homeworkId.edit.tsx Edit
_authenticated.homework.history.tsx          History + filters
_authenticated.homework.reports.tsx          Reports (counts by class/subject + CSV)
_authenticated.parent-homework.tsx           Parent: child filter + list + attachments

_authenticated.progress.tsx                  (layout)
_authenticated.progress.index.tsx            → redirect to observations
_authenticated.progress.observations.tsx     Daily observations CRUD
_authenticated.progress.behavior.tsx         Behavior tracking
_authenticated.progress.participation.tsx    Participation tracking
_authenticated.progress.academic.tsx         Academic remarks
_authenticated.progress.history.tsx          Combined history + filters
_authenticated.progress.reports.tsx          Reports (per-student summary + CSV)
_authenticated.parent-progress.tsx           Parent: overview + timeline
```

## 4. Sidebar (`_authenticated.tsx`)

Add two collapsible groups using the same `useState` toggle pattern as Attendance:

- **Homework Management** (admin + teacher): Create / List / History / Reports
- **Student Progress Tracking** (admin + teacher): Daily Observations / Behavior / Participation / Academic Remarks / Progress History / Progress Reports

For parents: add two single links:
- "Homework" → `/parent-homework`
- "Student Progress" → `/parent-progress`

## 5. Dashboard widgets

`_authenticated.dashboard.tsx`:
- **Teacher branch**: append two widget rows (Homework due today / recent / upcoming; Recent observations / Students needing attention / Recent remarks)
- **Parent branch**: append two widget rows (Pending homework / Upcoming / Recent; Recent feedback / Latest academic / Behavior summary)

## 6. Notifications

Reuse `notifications` table + `insertNotification` helper from `notifications.functions.ts`. Add new `type` strings: `homework_new`, `homework_due_tomorrow`, `homework_overdue`, `progress_new`, `progress_academic`, `progress_behavior_concern`. Already realtime-enabled, bell badge already wired.

`homework_due_tomorrow` / `homework_overdue`: phase 1 evaluated lazily when parent opens dashboard/homework view (idempotent insert keyed on `(user_id, type, homework_id)` via a uniqueness check), so no cron is required.

## 7. Storage

Create bucket `homework-attachments` (private). Upload via signed-URL pattern from existing patterns; render download links via signed URLs in server fns. Validate MIME (PDF/DOCX/images) and size (≤ 10MB) server-side.

## Out of scope (phase 1)

- Email/SMS channels
- Student submission/upload flows (only teacher assigns)
- Rich-text descriptions (plain textarea)
- Bulk import
- Cron-driven daily digest (lazy eval covers due-tomorrow/overdue)

Confirm and I'll execute: migration first → storage bucket → code in parallel batches.
