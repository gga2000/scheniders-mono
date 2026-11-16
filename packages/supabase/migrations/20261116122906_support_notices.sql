-- Merchant support, wave 5: notices.
--
-- Staff post a short notice ("Prime is slow today, orders still go out") that
-- shows at the top of every merchant's Help chat until it ends: at the hour
-- staff chose, or when staff end it. One notice is live at a time; posting a
-- new one ends the old one, so merchants never see two that disagree.
--
-- Server-only, like the other support tables: RLS on, no policies, no grants to
-- the browser roles. The staff console writes through the two functions below
-- (service role); the merchant app reads the live notice with the service role.

CREATE TABLE public.support_notices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    body            text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 300),
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name text NOT NULL CHECK (char_length(created_by_name) BETWEEN 1 AND 120),
    created_at      timestamptz NOT NULL DEFAULT now(),
    ends_at         timestamptz NOT NULL,
    ended_at        timestamptz,
    ended_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (ends_at > created_at),
    CHECK (ended_at IS NULL OR ended_at >= created_at)
);

-- At most one notice not yet closed. An expired one is closed by the next post.
CREATE UNIQUE INDEX support_notices_one_open ON public.support_notices ((true)) WHERE ended_at IS NULL;
CREATE INDEX support_notices_created_idx ON public.support_notices (created_at DESC);

ALTER TABLE public.support_notices ENABLE ROW LEVEL SECURITY;
-- Notices stay on record: nobody deletes one, the service role included.
REVOKE ALL ON TABLE public.support_notices FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_notices TO service_role;

-- Post a notice for p_hours (1 to 72), ending the one before it.
CREATE OR REPLACE FUNCTION public.support_notice_post(
    p_admin_id uuid,
    p_admin_name text,
    p_body text,
    p_hours integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_body text := btrim(coalesce(p_body, ''));
    v_name text := left(coalesce(nullif(btrim(p_admin_name), ''), 'Support'), 120);
    v_notice public.support_notices;
BEGIN
    IF length(v_body) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'support_notice_bad_body' USING errcode = 'P0001';
    END IF;
    IF p_hours IS NULL OR p_hours NOT BETWEEN 1 AND 72 THEN
        RAISE EXCEPTION 'support_notice_bad_hours' USING errcode = 'P0001';
    END IF;

    -- Two staff posting at once: the second waits, then ends the first's notice.
    PERFORM pg_advisory_xact_lock(hashtext('public.support_notices'));

    UPDATE public.support_notices n
    SET ended_at = least(v_now, n.ends_at),
        ended_by = CASE WHEN n.ends_at > v_now THEN p_admin_id END
    WHERE n.ended_at IS NULL;

    INSERT INTO public.support_notices (body, created_by, created_by_name, created_at, ends_at)
    VALUES (v_body, p_admin_id, v_name, v_now, v_now + make_interval(hours => p_hours))
    RETURNING * INTO v_notice;

    RETURN jsonb_build_object(
        'id', v_notice.id, 'body', v_notice.body, 'created_by_name', v_notice.created_by_name,
        'created_at', v_notice.created_at, 'ends_at', v_notice.ends_at);
END;
$$;

-- End the live notice now. Returns how many notices merchants stopped seeing (0 or 1).
CREATE OR REPLACE FUNCTION public.support_notice_end(p_admin_id uuid) RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_live integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('public.support_notices'));

    SELECT count(*) INTO v_live
    FROM public.support_notices n
    WHERE n.ended_at IS NULL AND n.ends_at > v_now;

    UPDATE public.support_notices n
    SET ended_at = least(v_now, n.ends_at),
        ended_by = CASE WHEN n.ends_at > v_now THEN p_admin_id END
    WHERE n.ended_at IS NULL;

    RETURN v_live;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notice_post(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_notice_end(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_notice_post(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_notice_end(uuid) TO service_role;
