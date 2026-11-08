-- Security round 4 (D-07): a member can set their own avatar_url, which other
-- staff's browsers then load and which is copied onto order cards. Only https
-- URLs (or none) are valid; every existing row already complies.
ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_avatar_url_https;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_avatar_url_https
    CHECK (avatar_url IS NULL OR (avatar_url ~ '^https://[^\s"''<>]+$' AND length(avatar_url) <= 2048));
