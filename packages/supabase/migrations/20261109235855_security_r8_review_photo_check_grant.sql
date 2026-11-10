-- The CHECK on product_reviews runs as the writing role, so it must be callable
-- by every role that writes reviews. Pure function, no data access.
GRANT EXECUTE ON FUNCTION public.review_photo_paths_ok(uuid, text[]) TO anon, authenticated, service_role;
