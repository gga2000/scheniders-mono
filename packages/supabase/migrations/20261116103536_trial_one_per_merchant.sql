-- Fermi handoff B5 core (due 22 Nov): one free trial per merchant.
--
-- A merchant who already had a trial does not get a second free week by
-- signing up with a new email or SIM. Detection is quiet: nothing here ever
-- tells a merchant about another store, and a caught store is not suspended,
-- it starts in "pay to activate" (the A1 lock: orders, shipping and paying stay
-- open, the storefront takes 50 more orders).
--
-- Signals built now (strongest first):
--   * prime  (strong): the same Prime account (prime_connections.merchant_key)
--                      as an earlier store.
--   * phone  (medium): the owner phone (tenants.contact_phone) of an earlier store.
--   * email  (medium): a team member's sign-in email, or the store's contact
--                      email, of an earlier store. Platform staff (admin_users)
--                      are left out: they join shops to help them.
-- Later: Al-Waseet account (needs the merchant ID, B8 item 2), customer-phone
-- overlap after 30 orders (13 Dec).
--
-- "An earlier store" is another store created before this one that is not
-- paying now (still on trial, trial ended, unpaid, paused, cancelled). A store
-- that pays is a merchant opening a second brand: not counted. Ali's house
-- store (plan internal), the demo store (is_demo), a sales prospect store
-- (is_prospect: staff built it with the lead's phone, so the lead's own signup
-- would match it) and the stores in trial_check_exempt (the test shop #100095)
-- are never checked and never counted.
--
-- Rules (handoff B5): no signal, normal trial. One medium signal, normal trial
-- and a "Review" row on the staff trials page. One strong or two medium: the
-- running trial ends now, the store is locked as an ended trial, and its lock
-- screen shows the kind message. Staff can give the trial back (logged); after
-- that, no check ends it again.
--
-- Privacy: identifiers are stored only as HMAC-SHA256 with a random Vault
-- pepper (the Shield pattern), per family, so a digest never matches across
-- families and the pepper never leaves the database. The three tables have RLS
-- on, no policy, and no grants to anon or authenticated; only the staff console
-- (service role) reads them.
--
-- Rollback:
--   DROP TRIGGER trg_trial_check ON public.tenants;
--   DROP TRIGGER trg_trial_check ON public.tenant_members;
--   DROP TRIGGER trg_trial_check ON public.prime_connections;
--   DROP FUNCTION public.admin_trial_check_decide(uuid, text, text, integer, uuid, text),
--     public.trial_check_on_change(), public.trial_check_run(uuid),
--     public.trial_check_end_trial(uuid), public.trial_fingerprints_refresh(uuid),
--     public.trial_check_skipped(uuid), public.tenant_is_paying(uuid),
--     public.trial_email_key(text), public.trial_fingerprint_digest(text, text);
--   DROP TABLE public.trial_checks, public.trial_fingerprints, public.trial_check_exempt;
--   DELETE FROM vault.secrets WHERE name = 'trial_fingerprint_pepper';
--   and billing_lock_status from 20261116064916_fermi_wallet_runway_and_renewal_reminder.sql

-- 1. Pepper -------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'trial_fingerprint_pepper') THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'trial_fingerprint_pepper',
            'Fermi B5: HMAC key for trial fingerprints. Rotating it orphans every stored fingerprint.');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trial_fingerprint_digest(_family text, _value text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT encode(extensions.hmac(_family || ':' || _value, s.decrypted_secret, 'sha256'), 'hex')
      FROM vault.decrypted_secrets s
     WHERE s.name = 'trial_fingerprint_pepper';
$function$;
REVOKE ALL ON FUNCTION public.trial_fingerprint_digest(text, text) FROM PUBLIC, anon, authenticated;

-- One mailbox, one key: case, "+tag" and Gmail dots do not make a new person.
CREATE OR REPLACE FUNCTION public.trial_email_key(_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN e !~ '^[^@[:space:]]+@[^@[:space:]]+$' THEN NULL
        WHEN split_part(split_part(e, '@', 1), '+', 1) = '' THEN NULL
        WHEN split_part(e, '@', 2) IN ('gmail.com', 'googlemail.com')
            THEN replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
        ELSE split_part(split_part(e, '@', 1), '+', 1) || '@' || split_part(e, '@', 2)
    END
      FROM (SELECT lower(btrim(_email)) AS e) x;
$function$;
REVOKE ALL ON FUNCTION public.trial_email_key(text) FROM PUBLIC, anon, authenticated;

-- 2. Tables -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_check_exempt (
    tenant_id  uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    note       text        NOT NULL CHECK (length(btrim(note)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_check_exempt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_check_exempt FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.trial_check_exempt IS
    'Fermi B5: stores the one-trial check never looks at and never matches against (test shops).';

INSERT INTO public.trial_check_exempt (tenant_id, note)
SELECT id, 'Test merchant #100095 (Fermi handoff test shop)'
  FROM public.tenants
 WHERE id = '6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d'
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.trial_fingerprints (
    tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    family        text        NOT NULL CHECK (family IN ('phone', 'email', 'prime')),
    digest        text        NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    source        text        NOT NULL CHECK (source IN ('owner_phone', 'contact_email', 'member_email', 'prime_account')),
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, family, digest)
);
CREATE INDEX IF NOT EXISTS trial_fingerprints_match_idx ON public.trial_fingerprints (family, digest);
ALTER TABLE public.trial_fingerprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_fingerprints FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.trial_fingerprints IS
    'Fermi B5: keyed hashes of the identifiers a store has used. Kept when the store changes them, so history cannot be erased.';

CREATE TABLE IF NOT EXISTS public.trial_checks (
    tenant_id         uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    verdict           text        NOT NULL CHECK (verdict IN ('review', 'no_trial')),
    -- [{family, source, tenant_id}]: which identifier matched which earlier store.
    signals           jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(signals) = 'array'),
    -- When this check (or staff) ended the store's trial; the lock screen then
    -- shows the kind message.
    trial_withheld_at timestamptz,
    staff_decision    text        CHECK (staff_decision IN ('allow_trial', 'end_trial', 'checked')),
    staff_reason      text,
    decided_by        uuid,
    decided_by_email  text,
    decided_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    -- Moves only when the verdict or the signals change, so a row whose
    -- updated_at is after decided_at has news for staff.
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK ((staff_decision IS NULL) = (decided_at IS NULL))
);
CREATE INDEX IF NOT EXISTS trial_checks_updated_idx ON public.trial_checks (updated_at DESC);
ALTER TABLE public.trial_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_checks FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.trial_checks IS
    'Fermi B5: stores that matched an earlier store, for the staff trials page. Never shown to merchants.';

-- 3. Who is checked, who counts -------------------------------------------------
CREATE OR REPLACE FUNCTION public.trial_check_skipped(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT coalesce((
        SELECT t.is_demo
            OR t.plan IS NOT DISTINCT FROM 'internal'
            OR coalesce(t.is_prospect, false)
            OR EXISTS (SELECT 1 FROM public.trial_check_exempt e WHERE e.tenant_id = t.id)
          FROM public.tenants t
         WHERE t.id = _tenant_id), true);
$function$;
REVOKE ALL ON FUNCTION public.trial_check_skipped(uuid) FROM PUBLIC, anon, authenticated;

-- Paying now: an active store that is not under the unpaid lock (A1).
CREATE OR REPLACE FUNCTION public.tenant_is_paying(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.status = 'active')
       AND NOT EXISTS (SELECT 1 FROM public.tenant_billing_lock(_tenant_id));
$function$;
REVOKE ALL ON FUNCTION public.tenant_is_paying(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Record what the store uses now ---------------------------------------------
CREATE OR REPLACE FUNCTION public.trial_fingerprints_refresh(_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    INSERT INTO public.trial_fingerprints (tenant_id, family, digest, source)
    SELECT DISTINCT ON (v.family, v.value)
           _tenant_id, v.family, public.trial_fingerprint_digest(v.family, v.value), v.source
      FROM (
            SELECT 'phone' AS family, 'owner_phone' AS source, public.normalize_phone(t.contact_phone) AS value, 1 AS rank
              FROM public.tenants t WHERE t.id = _tenant_id
            UNION ALL
            SELECT 'email', 'member_email', public.trial_email_key(u.email), 2
              FROM public.tenant_members m
              JOIN auth.users u ON u.id = m.user_id
             WHERE m.tenant_id = _tenant_id
               AND m.status = 'active'
               AND NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = m.user_id)
            UNION ALL
            SELECT 'email', 'contact_email', public.trial_email_key(t.contact_email), 3
              FROM public.tenants t WHERE t.id = _tenant_id
            UNION ALL
            SELECT 'prime', 'prime_account', c.merchant_key, 4
              FROM public.prime_connections c WHERE c.tenant_id = _tenant_id
           ) v
     WHERE v.value IS NOT NULL
       AND v.value <> ''
       -- An Iraqi mobile is 10 digits once 964 / 0 are gone; anything shorter
       -- is a typo that would match strangers.
       AND (v.family <> 'phone' OR length(v.value) BETWEEN 10 AND 12)
     ORDER BY v.family, v.value, v.rank
    ON CONFLICT (tenant_id, family, digest) DO NOTHING;
$function$;
REVOKE ALL ON FUNCTION public.trial_fingerprints_refresh(uuid) FROM PUBLIC, anon, authenticated;

-- 5. End a running trial now (the A1 lock takes over). Lock order as
--    admin_extend_trial: 'trial_cap:' advisory lock, subscriptions, tenant.
CREATE OR REPLACE FUNCTION public.trial_check_end_trial(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _end timestamptz;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));
    PERFORM 1
       FROM public.subscriptions
      WHERE tenant_id = _tenant_id
        AND status IN ('trialing', 'past_due')
      ORDER BY id
        FOR UPDATE;
    SELECT trial_ends_at INTO _end
      FROM public.tenants
     WHERE id = _tenant_id AND status = 'trial'
       FOR UPDATE;
    IF NOT FOUND OR (_end IS NOT NULL AND _end <= now()) THEN
        RETURN false;
    END IF;

    UPDATE public.tenants SET trial_ends_at = now() WHERE id = _tenant_id;
    UPDATE public.subscriptions
       SET current_period_end = now(), updated_at = now()
     WHERE tenant_id = _tenant_id AND status = 'trialing';
    RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_check_end_trial(uuid) FROM PUBLIC, anon, authenticated;

-- 6. The check ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trial_check_run(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _status text;
    _created timestamptz;
    _signals jsonb;
    _strong integer;
    _medium integer;
    _verdict text;
    _decision text;
BEGIN
    SELECT t.status::text, t.created_at INTO _status, _created
      FROM public.tenants t WHERE t.id = _tenant_id;
    IF NOT FOUND OR public.trial_check_skipped(_tenant_id) THEN
        RETURN NULL;
    END IF;

    -- Every store's identifiers are kept, paying or not: a paying store that
    -- stops paying counts as an earlier store from then on.
    PERFORM public.trial_fingerprints_refresh(_tenant_id);

    IF _status <> 'trial' THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object('family', h.family, 'source', h.source, 'tenant_id', h.matched)
                              ORDER BY h.family, h.source, h.matched), '[]'::jsonb),
           count(DISTINCT h.digest) FILTER (WHERE h.family = 'prime'),
           count(DISTINCT h.family || ':' || h.digest) FILTER (WHERE h.family IN ('phone', 'email'))
      INTO _signals, _strong, _medium
      FROM (
            SELECT DISTINCT m.family, m.digest, m.source, f.tenant_id AS matched
              FROM public.trial_fingerprints m
              JOIN public.trial_fingerprints f
                ON f.family = m.family AND f.digest = m.digest AND f.tenant_id <> m.tenant_id
              JOIN public.tenants o ON o.id = f.tenant_id
             WHERE m.tenant_id = _tenant_id
               AND o.created_at < _created
               AND NOT public.trial_check_skipped(o.id)
               AND NOT public.tenant_is_paying(o.id)
           ) h;

    _verdict := CASE
        WHEN _strong > 0 OR _medium >= 2 THEN 'no_trial'
        WHEN _medium = 1 THEN 'review'
    END;
    IF _verdict IS NULL THEN
        RETURN NULL;
    END IF;

    -- A verdict never goes back down (an earlier store that starts paying
    -- leaves the list of signals, not the decision already taken).
    INSERT INTO public.trial_checks AS c (tenant_id, verdict, signals)
    VALUES (_tenant_id, _verdict, _signals)
    ON CONFLICT (tenant_id) DO UPDATE
       SET verdict = CASE WHEN c.verdict = 'no_trial' THEN 'no_trial' ELSE EXCLUDED.verdict END,
           signals = EXCLUDED.signals,
           updated_at = now()
     WHERE c.signals IS DISTINCT FROM EXCLUDED.signals
        OR (c.verdict = 'review' AND EXCLUDED.verdict = 'no_trial');

    SELECT c.verdict, c.staff_decision INTO _verdict, _decision
      FROM public.trial_checks c WHERE c.tenant_id = _tenant_id;

    IF _verdict = 'no_trial'
       AND _decision IS DISTINCT FROM 'allow_trial'
       AND public.trial_check_end_trial(_tenant_id) THEN
        UPDATE public.trial_checks SET trial_withheld_at = now() WHERE tenant_id = _tenant_id;
        INSERT INTO public.admin_activity_logs (admin_label, tenant_id, action, details)
        VALUES ('system', _tenant_id, 'trial_withheld',
                jsonb_build_object('signals', (SELECT jsonb_agg(DISTINCT s->>'family') FROM jsonb_array_elements(_signals) s)));
    END IF;

    RETURN _verdict;
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_check_run(uuid) FROM PUBLIC, anon, authenticated;

-- 7. When to check: signup and contact change, a member joins, a Prime
--    account is linked.
CREATE OR REPLACE FUNCTION public.trial_check_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_TABLE_NAME = 'tenants' THEN
        PERFORM public.trial_check_run(NEW.id);
    ELSE
        PERFORM public.trial_check_run(NEW.tenant_id);
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_check_on_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_trial_check ON public.tenants;
CREATE TRIGGER trg_trial_check
    AFTER INSERT OR UPDATE OF contact_phone, contact_email ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.trial_check_on_change();

DROP TRIGGER IF EXISTS trg_trial_check ON public.tenant_members;
CREATE TRIGGER trg_trial_check
    AFTER INSERT OR UPDATE OF status, user_id ON public.tenant_members
    FOR EACH ROW WHEN (NEW.status = 'active')
    EXECUTE FUNCTION public.trial_check_on_change();

DROP TRIGGER IF EXISTS trg_trial_check ON public.prime_connections;
CREATE TRIGGER trg_trial_check
    AFTER INSERT OR UPDATE OF merchant_login_id ON public.prime_connections
    FOR EACH ROW EXECUTE FUNCTION public.trial_check_on_change();

-- 8. Staff: give the trial back, end it, or mark the row checked ------------------
CREATE OR REPLACE FUNCTION public.admin_trial_check_decide(
    _tenant_id uuid,
    _decision text,
    _reason text,
    _days integer DEFAULT NULL,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _why text;
    _verdict text;
    _extended jsonb;
    _ended boolean := false;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_trial_check_decide is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _decision IS NULL OR _decision NOT IN ('allow_trial', 'end_trial', 'checked') THEN
        RAISE EXCEPTION 'decision must be allow_trial, end_trial or checked' USING ERRCODE = '22023';
    END IF;
    IF _decision = 'allow_trial' AND (_days IS NULL OR _days < 1 OR _days > 90) THEN
        RAISE EXCEPTION 'days must be a whole number between 1 and 90' USING ERRCODE = '22023';
    END IF;
    _why := public.admin_billing_reason(_reason);

    SELECT verdict INTO _verdict FROM public.trial_checks WHERE tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    IF _decision = 'allow_trial' THEN
        _extended := public.admin_extend_trial(_tenant_id, _days, _why, _admin_user_id, _actor_email, 'trial_check');
        IF (_extended->>'success')::boolean IS NOT TRUE THEN
            RETURN _extended;
        END IF;
    ELSIF _decision = 'end_trial' THEN
        IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND status = 'trial') THEN
            RETURN jsonb_build_object('success', false, 'error', 'not_trial');
        END IF;
        _ended := public.trial_check_end_trial(_tenant_id);
    END IF;

    UPDATE public.trial_checks
       SET staff_decision = _decision,
           staff_reason = _why,
           decided_by = _admin_user_id,
           decided_by_email = nullif(btrim(_actor_email), ''),
           decided_at = now(),
           trial_withheld_at = CASE
               WHEN _decision = 'allow_trial' THEN NULL
               WHEN _decision = 'end_trial' THEN coalesce(trial_withheld_at, now())
               ELSE trial_withheld_at
           END
     WHERE tenant_id = _tenant_id;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES
        (_admin_user_id,
         nullif(btrim(_actor_email), ''),
         CASE WHEN _admin_user_id IS NULL AND nullif(btrim(_actor_email), '') IS NULL THEN 'system' END,
         _tenant_id,
         'trial_check_' || _decision,
         jsonb_build_object('reason', _why, 'verdict', _verdict, 'days', _days, 'trial_ended_now', _ended));

    RETURN jsonb_build_object('success', true, 'tenant_id', _tenant_id, 'decision', _decision);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_trial_check_decide(uuid, text, text, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trial_check_decide(uuid, text, text, integer, uuid, text) TO service_role;

-- 9. The lock screen: say "we found an earlier store of yours" instead of
--    "your trial ended" when this check (or staff) ended the trial. Only a
--    yes/no: never which store, never which signal.
CREATE OR REPLACE FUNCTION public.billing_lock_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _admin boolean;
    _balance numeric;
    _daily integer;
    _snapshot jsonb;
    _previous boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    -- Money is for the shop's admins only.
    _admin := coalesce(public.is_tenant_admin(p_tenant_id), false);
    IF _admin THEN
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id;
        _daily := public.wallet_daily_spend_iqd(p_tenant_id);
    END IF;

    _snapshot := public.billing_lock_snapshot(p_tenant_id);
    IF _snapshot->>'reason' = 'trial_ended' THEN
        _previous := EXISTS (
            SELECT 1 FROM public.trial_checks c
             WHERE c.tenant_id = p_tenant_id
               AND c.trial_withheld_at IS NOT NULL
               AND c.staff_decision IS DISTINCT FROM 'allow_trial');
    END IF;

    RETURN _snapshot
        || jsonb_build_object('balance_iqd', _balance, 'daily_spend_iqd', _daily, 'can_pay', _admin,
                              'previous_store', _previous);
END;
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_lock_status(uuid) TO authenticated;

-- 10. Stores that exist today (none is checked: house, demo and test shop).
SELECT public.trial_check_run(t.id) FROM public.tenants t ORDER BY t.created_at;
