## Communication Module

Internal 1:1 messaging between Teachers and Parents, with read receipts, attachments, realtime updates, and PWA-friendly responsive UI.

### 1. Database (single migration)

Tables (all `public`, with GRANTs + RLS):

- `conversations`
  - `id`, `school_id`, `teacher_id` (→ teachers.id), `parent_id` (→ parents.id), `student_id` (→ students.id, optional context), `last_message_at`, `last_message_preview`, `created_at`, `updated_at`
  - UNIQUE `(teacher_id, parent_id, student_id)`
- `messages`
  - `id`, `conversation_id`, `sender_user_id` (auth user), `sender_role` (`teacher|parent`), `body` (text, nullable when attachment-only), `delivered_at`, `created_at`
- `message_reads`
  - `id`, `message_id`, `user_id`, `read_at`, UNIQUE `(message_id, user_id)`
- `message_attachments`
  - `id`, `message_id`, `file_name`, `file_path`, `mime_type`, `size`, `created_at`

RLS:
- Conversations: visible to the teacher (via `teachers.user_id = auth.uid()`) and parent (via `parents.user_id = auth.uid()`) on that row; admins of same school full read.
- Messages / reads / attachments: gated by `EXISTS conversation visible to caller`.
- Insert messages: sender must be a participant of the conversation.
- `message_reads`: each user inserts/selects only their own row.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE messages, message_reads, conversations;`

Helper SECURITY DEFINER fn: `is_conversation_participant(_conv uuid)`.

### 2. Storage

New private bucket `chat-attachments`. Allowed mime: pdf/doc/docx/jpg/png. Max 10 MB per file enforced server-side.
RLS on `storage.objects`: a user can read/write objects whose path begins with a conversation id they participate in.

### 3. Server functions (`src/lib/chat.functions.ts`)

- `listConversations({ q? })` — for current user (teacher or parent), ordered by `last_message_at desc`, with unread count + other participant info.
- `getOrCreateConversation({ otherUserId, studentId? })` — teacher initiates with parent (must teach parent's child); parent initiates with teacher (must teach parent's child).
- `listMessages({ conversationId, before?, limit })` — paginated.
- `sendMessage({ conversationId, body?, attachments?: [{path, name, mime, size}] })` — validates membership; inserts message + attachments; updates `conversations.last_message_*`.
- `markConversationRead({ conversationId })` — inserts `message_reads` for unread messages of the other participant.
- `getMessageReadStatus({ messageId })` — for sender's read receipts.
- `createAttachmentUploadUrl({ conversationId, fileName, mime, size })` — returns signed upload URL after validation.
- `listEligibleRecipients()` — teacher: list parents of their students; parent: list teachers of their children.

### 4. Routes

- `_authenticated.chat.tsx` — layout (sidebar conversation list + outlet)
- `_authenticated.chat.index.tsx` — empty state / "select a conversation"
- `_authenticated.chat.$conversationId.tsx` — message thread + composer
- `_authenticated.chat.new.tsx` — pick recipient (and child) to start conversation

Both teacher and parent use the same `/chat/*` routes; server fns scope by role.

### 5. UI

- Two-pane layout on desktop (list left, thread right); single-pane stack on mobile (list → thread navigation).
- Conversation list: avatar, name, role chip, last message preview, timestamp, unread badge, search input, sorted by latest activity.
- Thread: scrollable history, day separators, message bubbles with timestamp, sent/delivered/read ticks (✓ / ✓✓ / blue ✓✓ + read time on hover), image previews inline, file chips with download.
- Composer: textarea + attach button (multi-file) + send. Client-side validation (type/size). Upload via signed URL then send message referencing paths.
- Realtime: subscribe to `messages` filtered by conversation; subscribe to `message_reads` to update read state; conversation-list subscribes to `conversations` updates for the user.
- Auto-mark-read on thread open and when new messages arrive while focused.

### 6. Sidebar

In `_authenticated.tsx`, add a new collapsible heading **COMMUNICATION** containing a single item **Chat** → `/chat`. Show for `teacher` and `parent` roles.

### 7. Out of scope (phase 1)

Group chats, typing indicators, message edit/delete, push notifications, true antivirus scanning (we expose a hook point but rely on mime/size validation + private bucket for now).

Approve and I'll execute: migration → storage bucket → server fns → routes → sidebar wiring.
