INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-attachments', 'chat-attachments', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- path: {tenant_id}/{conversation_id}/{file}. First folder = tenant id.
CREATE POLICY chat_attachments_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_attachments_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_attachments_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
    );;
