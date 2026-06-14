## Part A — Small UI changes (quick)

1. **Sidebar (`src/routes/_authenticated.tsx`)** — add two new section headings (admin-only):
   - **SCHOOL MANAGEMENT** → `School Profile`, `User Management`
   - **ADMINISTRATION** → `Teachers` (in addition to the existing Classes & Sections / Students / Parents already grouped under ADMINISTRATION)
   Remove these items from the flat top-level nav.
2. **Admin dashboard (`_authenticated.dashboard.tsx`)** — when role is `admin`, do not render the 4-card `DynamicCards` 2×2 grid (and hide the date filter for admin since it only drives those cards). Teacher and Parent dashboards keep the cards.

## Part B — Announcement Module

### B1. Database migration

Enums:
- `announcement_type`: `school_wide | class_specific`
- `announcement_priority`: `low | medium | high | urgent`
- `announcement_status`: `draft | scheduled | published | expired | archived`
- `announcement_category`: `school_closure | public_holiday | sports_day | parent_teacher_meeting | exam_schedule | homework_reminder | class_test | field_trip | project_submission | other`

Tables (all in `public`, with `GRANT … TO authenticated`, `GRANT ALL … TO service_role`, RLS enabled):
- `announcements` — `id, school_id, type, title, description, category, priority, publish_at, expires_at, status, class_id (nullable), section_id (nullable), created_by (user_id), created_at, updated_at`
- `announcement_attachments` — `id, announcement_id, file_name, file_path, mime_type, size, created_at`
- `announcement_reads` — `id, announcement_id, user_id, read_at` (unique on `(announcement_id, user_id)`)

RLS:
- Admins (`has_role(uid,'admin')` + same school): full CRUD.
- Teachers: insert/update/delete own announcements; for class-specific must pass `is_teacher_of_section(section_id)`; select on school-wide (school) + class-specific for sections they teach + their own.
- Parents: select on school-wide (school) + class-specific where `is_parent_of_student` exists for a student in that class/section.
- `announcement_reads`: each user can insert/select their own rows.

Storage: new private bucket `announcement-attachments` with policies mirroring `homework-attachments` (teachers/admins upload for their scope; teachers/parents read attachments for announcements they can see).

### B2. Server functions (`src/lib/announcements.functions.ts`)

- `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`, `publishAnnouncement`, `archiveAnnouncement`
- `listAnnouncements({ status?, type?, from?, to?, q? })` — admin/teacher scoped
- `getAnnouncement(id)` with attachments + read stats
- `getAnnouncementsForParent({ studentId?, from?, to?, q? })`
- `getAnnouncementsForTeacher({ from?, to?, q? })`
- `markAnnouncementRead({ announcementId })`
- `uploadAnnouncementAttachment` (signed URL) + `removeAnnouncementAttachment`
- `getAnnouncementDashboardWidgets()` — admin (totals by status), teacher (recent + upcoming), parent (latest + unread + urgent)
- On publish → resolve audience and insert rows into `notifications` (new type strings: `announcement_school_wide`, `announcement_class`) using existing helper.
- Lazy "expire" pass on list reads: flips `status` to `expired` when `expires_at < now()`.

### B3. Routes

```
_authenticated.announcements.tsx                (layout - admin/teacher)
_authenticated.announcements.index.tsx          → redirect to history
_authenticated.announcements.create.tsx         Create
_authenticated.announcements.history.tsx        List + filters + edit/delete/publish/archive
_authenticated.announcements.$id.edit.tsx       Edit
_authenticated.announcements.categories.tsx     Category reference list
_authenticated.parent-announcements.tsx         Parent view
```

(Teacher uses the same `/announcements/*` routes; server fns scope by role.)

### B4. Sidebar additions

New collapsible heading **ANNOUNCEMENT**:
- Admin + Teacher: `Create Announcement`, `Announcement History`, `Announcement Categories`
- Parent: single link **`Announcements`** → `/parent-announcements` (placed under existing parent grouping)

### B5. Dashboard widgets

- **Admin**: 4 stat tiles — Total / Published / Scheduled / Expired (replaces nothing, added as its own section since the 2×2 cards are removed for admin).
- **Teacher**: appended row — Recent Announcements + Upcoming Scheduled.
- **Parent**: appended row — Latest + Unread + Urgent.

### B6. Notifications

Reuse existing `notifications` table + `insertNotification` helper. New `type` values: `announcement_school_wide`, `announcement_class`. Bell badge already realtime.

### Out of scope (phase 1)

Email/SMS channels, push, manual recipient overrides, rich-text editor, bulk import, scheduled-publish cron (publish-immediately works; `scheduled` rows transition to `published` lazily when the publish_at time has passed and the row is fetched/listed — no cron needed phase 1).

Confirm and I'll execute: migration + storage bucket → server fns → routes → sidebar/dashboard wiring in parallel batches.
