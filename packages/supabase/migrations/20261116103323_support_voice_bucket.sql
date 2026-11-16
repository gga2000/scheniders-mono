-- Merchant support, wave 3: voice notes in the Help chat.
--
-- The merchant presses the microphone, speaks (up to 2 minutes) and the app
-- stores the recording here as <tenant_id>/<uuid>.<webm|m4a|ogg>: Chrome and
-- Android record WebM/Opus, iPhone Safari records MP4/AAC. The message keeps
-- the path in its context (context.voice). Staff and the merchant play it
-- through a short-lived signed URL.
--
-- Private, and no policy on storage.objects names this bucket, so only the
-- service role (the app's own routes) can read or write it, like the
-- support-shots bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('support-voice', 'support-voice', false, 2097152, ARRAY['audio/webm', 'audio/mp4', 'audio/ogg'])
ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;