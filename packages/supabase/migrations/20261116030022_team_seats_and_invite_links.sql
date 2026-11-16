-- Team seats and invite links (Fermi handoff A2).
--
-- 1. Each plan caps its team (Q7: Start 2, Team 6, Business 20; -1 is no
--    cap). A seat is an active member or a pending invite that has not
--    expired, so the owner holds one. starter becomes 2 and growth 6;
--    professional is already 20.
-- 2. An invite names an email or an Iraqi mobile (07XXXXXXXXX), carries the
--    sha-256 of its link token, and expires 7 days after it is sent. The
--    owner can share the link on WhatsApp when the person has no email.
-- 3. team_seat_guard refuses an invite, or a member becoming active, once
--    the store's seats are used: PT402 (HTTP 402), hint TEAM_LIMIT. It runs
--    for every writer: the team routes, the auth callback and staff tools.
-- 4. accept_team_invite(invite, user, email, name) is the one way an invite
--    is taken. In a single transaction it writes the profile if the person
--    has none, marks the invite accepted, and adds or reactivates the
--    membership. The profile goes first, because the membership's foreign key
--    needs it (the 3 Nov tenant_members_user_id_fkey failure). An active
--    member keeps their role.
-- 5. team_seats(tenant) tells the team page how many seats are used.
--
-- Rollback:
--   DROP TRIGGER team_seat_guard ON public.team_invites;
--   DROP TRIGGER team_seat_guard ON public.tenant_members;
--   DROP FUNCTION public.team_seat_guard(), public.team_seats(uuid),
--     public.accept_team_invite(uuid, uuid, text, text),
--     public.team_seats_used(uuid, uuid), public.team_seat_limit(uuid);
--   DROP INDEX public.team_invites_token_hash_uidx, public.team_invites_tenant_phone_pending_uidx;
--   ALTER TABLE public.team_invites DROP CONSTRAINT team_invites_contact_check,
--     DROP CONSTRAINT team_invites_phone_check, DROP COLUMN phone,
--     DROP COLUMN token_hash, DROP COLUMN expires_at;
--   (then ALTER COLUMN email SET NOT NULL once no phone-only rows remain)
--   UPDATE public.plan_limits SET max_team_members = -1 WHERE plan = 'starter';
--   UPDATE public.plan_limits SET max_team_members = 8 WHERE plan = 'growth';

UPDATE public.plan_limits SET max_team_members = 2 WHERE plan = 'starter';
UPDATE public.plan_limits SET max_team_members = 6 WHERE plan = 'growth';

ALTER TABLE public.team_invites
    ALTER COLUMN email DROP NOT NULL,
    ADD COLUMN phone text,
    ADD COLUMN token_hash text,
    ADD COLUMN expires_at timestamptz;
UPDATE public.team_invites SET expires_at = created_at + interval '7 days';
ALTER TABLE public.team_invites
    ALTER COLUMN expires_at SET DEFAULT now() + interval '7 days',
    ALTER COLUMN expires_at SET NOT NULL,
    ADD CONSTRAINT team_invites_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL),
    ADD CONSTRAINT team_invites_phone_check CHECK (phone IS NULL OR phone ~ '^07[0-9]{9}$');
CREATE UNIQUE INDEX team_invites_token_hash_uidx
    ON public.team_invites (token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX team_invites_tenant_phone_pending_uidx
    ON public.team_invites (tenant_id, phone) WHERE status = 'pending' AND phone IS NOT NULL;

-- The store's seat cap from its plan; NULL means no cap.
CREATE OR REPLACE FUNCTION public.team_seat_limit(_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _max integer;
BEGIN
    SELECT pl.max_team_members INTO _max
      FROM public.tenants t
      JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = _tenant_id;
    RETURN CASE WHEN _max IS NULL OR _max < 0 THEN NULL ELSE _max END;
END;
$function$;
REVOKE ALL ON FUNCTION public.team_seat_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_seat_limit(uuid) TO service_role;

-- Seats in use: active members (but `_except_user`, the one being added) and
-- pending invites that have not expired.
CREATE OR REPLACE FUNCTION public.team_seats_used(_tenant_id uuid, _except_user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN (SELECT count(*) FROM public.tenant_members m
             WHERE m.tenant_id = _tenant_id AND m.status = 'active'
               AND m.user_id IS DISTINCT FROM _except_user)
         + (SELECT count(*) FROM public.team_invites i
             WHERE i.tenant_id = _tenant_id AND i.status = 'pending' AND i.expires_at > now());
END;
$function$;
REVOKE ALL ON FUNCTION public.team_seats_used(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_seats_used(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.team_seat_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _limit integer;
    _used integer;
    _joining uuid;
BEGIN
    IF TG_TABLE_NAME = 'team_invites' THEN
        IF NEW.status <> 'pending' THEN
            RETURN NEW;
        END IF;
        -- A live invite already holds its seat: resending it takes no new one.
        IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND OLD.expires_at > now() THEN
            RETURN NEW;
        END IF;
    ELSE
        IF NEW.status <> 'active' OR (TG_OP = 'UPDATE' AND OLD.status = 'active') THEN
            RETURN NEW;
        END IF;
        _joining := NEW.user_id;
    END IF;

    _limit := public.team_seat_limit(NEW.tenant_id);
    IF _limit IS NULL THEN
        RETURN NEW;
    END IF;

    -- One writer at a time per store, so two invites cannot both take the last seat.
    PERFORM pg_advisory_xact_lock(hashtext('team_seats:' || NEW.tenant_id::text));
    _used := public.team_seats_used(NEW.tenant_id, _joining);
    IF _used >= _limit THEN
        RAISE EXCEPTION 'team is full: % of % seats used', _used, _limit
            USING ERRCODE = 'PT402', HINT = 'TEAM_LIMIT';
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.team_seat_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER team_seat_guard
    BEFORE INSERT OR UPDATE OF status, expires_at ON public.team_invites
    FOR EACH ROW EXECUTE FUNCTION public.team_seat_guard();
CREATE TRIGGER team_seat_guard
    BEFORE INSERT OR UPDATE OF status ON public.tenant_members
    FOR EACH ROW EXECUTE FUNCTION public.team_seat_guard();

-- What the team page shows: the cap (NULL = none) and the seats in use.
CREATE OR REPLACE FUNCTION public.team_seats(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _members integer;
    _pending integer;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role'
       AND (_tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids())) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO _members FROM public.tenant_members
     WHERE tenant_id = _tenant_id AND status = 'active';
    SELECT count(*) INTO _pending FROM public.team_invites
     WHERE tenant_id = _tenant_id AND status = 'pending' AND expires_at > now();
    RETURN jsonb_build_object(
        'limit', public.team_seat_limit(_tenant_id),
        'used', _members + _pending,
        'members', _members,
        'pending', _pending);
END;
$function$;
REVOKE ALL ON FUNCTION public.team_seats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_seats(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_team_invite(
    _invite_id uuid,
    _user_id uuid,
    _email text,
    _display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _invite public.team_invites%ROWTYPE;
    _role text;
    _member_status text;
    _email_clean text := lower(nullif(btrim(_email), ''));
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'accept_team_invite is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _invite_id IS NULL OR _user_id IS NULL THEN
        RAISE EXCEPTION 'invite and user are required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _invite FROM public.team_invites WHERE id = _invite_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF _invite.status = 'accepted' AND _invite.accepted_user_id = _user_id THEN
        RETURN jsonb_build_object('success', true, 'tenant_id', _invite.tenant_id, 'already_member', true);
    END IF;
    IF _invite.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', CASE _invite.status WHEN 'accepted' THEN 'used' ELSE 'revoked' END);
    END IF;
    IF _invite.expires_at <= now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'expired');
    END IF;

    _role := CASE WHEN _invite.role IN ('admin', 'employee', 'viewer') THEN _invite.role ELSE 'employee' END;

    -- The profile first: the membership's foreign key points at it.
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = _user_id) THEN
        IF _email_clean IS NULL THEN
            RAISE EXCEPTION 'a new person needs an email for their profile' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.user_profiles (id, email, display_name, role, is_active, current_tenant_id)
        VALUES (_user_id, _email_clean,
                coalesce(nullif(btrim(_display_name), ''), _invite.display_name, split_part(_email_clean, '@', 1)),
                _role, true, _invite.tenant_id);
    ELSE
        UPDATE public.user_profiles SET current_tenant_id = _invite.tenant_id WHERE id = _user_id;
    END IF;

    -- Accepted before the membership is written, so the seat guard does not
    -- count this invite and the new member twice.
    UPDATE public.team_invites
       SET status = 'accepted', accepted_user_id = _user_id, accepted_at = now(), updated_at = now()
     WHERE id = _invite_id;

    SELECT status::text INTO _member_status
      FROM public.tenant_members
     WHERE tenant_id = _invite.tenant_id AND user_id = _user_id
       FOR UPDATE;
    IF NOT FOUND THEN
        INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at, invited_by, invited_at)
        VALUES (_invite.tenant_id, _user_id, _role, 'active', now(), _invite.invited_by, _invite.created_at);
    ELSIF _member_status <> 'active' THEN
        UPDATE public.tenant_members
           SET status = 'active', role = _role, joined_at = now()
         WHERE tenant_id = _invite.tenant_id AND user_id = _user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', _invite.tenant_id,
        'already_member', coalesce(_member_status = 'active', false));
END;
$function$;
REVOKE ALL ON FUNCTION public.accept_team_invite(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid, uuid, text, text) TO service_role;
