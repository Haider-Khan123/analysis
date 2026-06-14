
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, parent_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('teacher','parent')),
  body text,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
GRANT SELECT, INSERT ON public.message_reads TO authenticated;
GRANT ALL ON public.message_reads TO service_role;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    LEFT JOIN public.teachers t ON t.id = c.teacher_id
    LEFT JOIN public.parents p ON p.id = c.parent_id
    WHERE c.id = _conv AND (t.user_id = auth.uid() OR p.user_id = auth.uid())
  )
$$;

CREATE POLICY conv_select ON public.conversations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = conversations.teacher_id AND t.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parents p WHERE p.id = conversations.parent_id AND p.user_id = auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND school_id = public.current_school_id())
);
CREATE POLICY conv_insert ON public.conversations FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = conversations.teacher_id AND t.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parents p WHERE p.id = conversations.parent_id AND p.user_id = auth.uid())
);
CREATE POLICY conv_update ON public.conversations FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = conversations.teacher_id AND t.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parents p WHERE p.id = conversations.parent_id AND p.user_id = auth.uid())
);

CREATE TRIGGER conversations_updated BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_conv_teacher ON public.conversations(teacher_id, last_message_at DESC);
CREATE INDEX idx_conv_parent ON public.conversations(parent_id, last_message_at DESC);

CREATE POLICY msg_select ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id));
CREATE POLICY msg_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid() AND public.is_conversation_participant(conversation_id));
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at DESC);

CREATE POLICY reads_select ON public.message_reads FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reads.message_id AND public.is_conversation_participant(m.conversation_id))
);
CREATE POLICY reads_insert ON public.message_reads FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reads.message_id AND public.is_conversation_participant(m.conversation_id))
);
CREATE INDEX idx_reads_message ON public.message_reads(message_id);
CREATE INDEX idx_reads_user ON public.message_reads(user_id);

CREATE POLICY att_select ON public.message_attachments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_attachments.message_id AND public.is_conversation_participant(m.conversation_id))
);
CREATE POLICY att_insert ON public.message_attachments FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_attachments.message_id AND m.sender_user_id = auth.uid())
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

CREATE POLICY chat_obj_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'chat-attachments'
  AND public.is_conversation_participant((split_part(name, '/', 1))::uuid)
);
CREATE POLICY chat_obj_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chat-attachments'
  AND public.is_conversation_participant((split_part(name, '/', 1))::uuid)
);
