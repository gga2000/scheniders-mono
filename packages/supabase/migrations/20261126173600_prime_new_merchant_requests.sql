-- A store with no Prime account asks for one from the Prime page.
--
-- The store's admin fills the new account in (name, phone, governorate, the
-- login and password they will use in the Prime app). The request waits for
-- our team: approving it in the admin app lets the prime-sync cron create the
-- merchant and its shop at Prime (external/create-merchant, which joins our
-- integrated system), and then link the store as for an existing account.
--
-- 1. prime_link_requests.kind: 'existing' (the store types its Prime phone,
--    Fermi A3) or 'new'. A new request keeps the account to create in new_*
--    columns, and approved_at / approved_by once our team approves.
--    New outcomes: awaiting_approval (our team has not approved yet),
--    login_taken (Prime refused the login: the store picks another),
--    create_failed (Prime refused the account for another reason: our team looks).
-- 2. prime_saved_logins: the Prime app sign-in a store chose, so its owner can
--    look it up later. The password is stored only sealed (AES-256-GCM, key in
--    the server env, store id bound in); the table is server-only.
--
-- Rollback:
--   DROP TABLE public.prime_saved_logins;
--   ALTER TABLE public.prime_link_requests DROP COLUMN kind, DROP COLUMN new_name,
--     DROP COLUMN new_state, DROP COLUMN new_login_id, DROP COLUMN new_shop_name,
--     DROP COLUMN approved_at, DROP COLUMN approved_by;
--   and the outcome check from 20261116034713_prime_self_serve_connect.sql

ALTER TABLE public.prime_link_requests
    ADD COLUMN kind text NOT NULL DEFAULT 'existing'
        CONSTRAINT prime_link_requests_kind_check CHECK (kind IN ('existing', 'new')),
    ADD COLUMN new_name text
        CONSTRAINT prime_link_requests_new_name_check CHECK (new_name IS NULL OR length(btrim(new_name)) BETWEEN 1 AND 100),
    ADD COLUMN new_state text
        CONSTRAINT prime_link_requests_new_state_check CHECK (new_state IS NULL OR new_state ~ '^[A-Z]{3}$'),
    ADD COLUMN new_login_id text
        CONSTRAINT prime_link_requests_new_login_check CHECK (new_login_id IS NULL OR length(btrim(new_login_id)) BETWEEN 3 AND 40),
    ADD COLUMN new_shop_name text
        CONSTRAINT prime_link_requests_new_shop_check CHECK (new_shop_name IS NULL OR length(btrim(new_shop_name)) BETWEEN 1 AND 100),
    ADD COLUMN approved_at timestamptz,
    ADD COLUMN approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD CONSTRAINT prime_link_requests_new_complete CHECK (
        kind = 'existing' OR (new_name IS NOT NULL AND new_state IS NOT NULL AND new_login_id IS NOT NULL AND new_shop_name IS NOT NULL)
    );

ALTER TABLE public.prime_link_requests DROP CONSTRAINT prime_link_requests_outcome_check;
ALTER TABLE public.prime_link_requests ADD CONSTRAINT prime_link_requests_outcome_check
    CHECK (outcome IN ('not_linked', 'shared_account', 'choose_shop', 'no_shop', 'prime_down', 'awaiting_approval', 'login_taken', 'create_failed'));

COMMENT ON COLUMN public.prime_link_requests.kind IS
    'existing: the store typed the phone of its Prime account. new: the store asked us to create a Prime account (new_* columns); our team approves it (approved_at) before the cron creates it at Prime.';

-- The store reads the kind and the login it asked for with the rest of its request.
GRANT SELECT (kind, new_login_id, approved_at) ON public.prime_link_requests TO authenticated;

CREATE TABLE IF NOT EXISTS public.prime_saved_logins (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    login_id text NOT NULL CHECK (length(btrim(login_id)) BETWEEN 3 AND 40),
    password_sealed text NOT NULL CHECK (password_sealed LIKE 'v1.%'),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.prime_saved_logins IS
    'The Prime app sign-in a store chose when asking for a new Prime account. Server-only; the password is sealed with PRIME_LOGIN_KEY (store id bound in).';
ALTER TABLE public.prime_saved_logins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prime_saved_logins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.prime_saved_logins TO service_role;
