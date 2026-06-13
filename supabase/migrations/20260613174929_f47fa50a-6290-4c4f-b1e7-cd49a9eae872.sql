
CREATE POLICY "hw_obj_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'homework-attachments');

CREATE POLICY "hw_obj_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homework-attachments' AND owner = auth.uid());

CREATE POLICY "hw_obj_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'homework-attachments' AND owner = auth.uid());
