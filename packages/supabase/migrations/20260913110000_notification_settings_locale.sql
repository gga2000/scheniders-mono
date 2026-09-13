-- Push bodies were composed in English for everyone. The edge function cannot
-- know a recipient's language, so store it: the in-app feed already renders in
-- the viewer's locale, and a push that arrives in the wrong one is the same bug
-- the feed used to have.
ALTER TABLE public.notification_settings
    ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'ar'
    CHECK (locale IN ('ar', 'en'));

COMMENT ON COLUMN public.notification_settings.locale IS
    'Language for push/email copy. The in-app feed uses the browser''s own '
    'language; this is for channels composed server-side. Defaults to ar (Iraq).';
