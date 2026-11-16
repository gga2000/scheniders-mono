-- Merchant support, wave 2: a picture of the merchant's screen with a message.
--
-- The merchant presses "Picture of this screen" in the Help chat; the app
-- captures the page as a JPEG and the server stores it here as
-- <tenant_id>/<uuid>.jpg. The message keeps the path in its context
-- (context.screenshot). Staff see it through a short-lived signed URL.
--
-- Private, and no policy on storage.objects names this bucket, so only the
-- service role (the app's own routes) can read or write it. Screens can show
-- customer names and phones; a public or member-readable bucket would leak
-- them.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('support-shots', 'support-shots', false, 1572864, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;