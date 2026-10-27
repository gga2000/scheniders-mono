-- Orders copy the product image URL into orders.items (and the status actor's
-- avatar into last_status_changed_by_avatar) at write time. Rows written before
-- the move to this project still point at the old project's public storage
-- host, which no longer serves them, so /orders shows broken images.
-- Every referenced object exists at the same bucket/path in this project
-- (verified 2026-10-27: 4,511 item URLs across 8 files, 4 avatar files), so
-- only the host prefix changes.
--
-- Triggers are bypassed for this statement: it is a cosmetic link rewrite and
-- must not bump updated_at/version or fire inventory, trust, loyalty,
-- referral or notification side effects.
SET LOCAL session_replication_role = replica;

UPDATE public.orders
SET items = replace(
        items::text,
        'https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/',
        'https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/'
    )::jsonb
WHERE items::text LIKE '%https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/%';

UPDATE public.orders
SET last_status_changed_by_avatar = replace(
        last_status_changed_by_avatar,
        'https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/',
        'https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/'
    )
WHERE last_status_changed_by_avatar LIKE 'https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/%';

SET LOCAL session_replication_role = origin;
