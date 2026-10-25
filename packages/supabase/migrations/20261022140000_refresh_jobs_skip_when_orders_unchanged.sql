-- The customer-aggregates matview (every 10 min, 1.77 s average) and the
-- storefront's public stats (every 30 min, ~1 s) are both rebuilt from
-- `orders` alone, and were rebuilt on schedule whether or not a single order
-- had changed: about 160 full recomputes a day, overnight included, on a
-- 406 MB Free-plan instance that is already swapping.
--
-- Each now compares the orders table's write counters (inserts + updates +
-- deletes, from pg_stat_user_tables; hard deletes included, which no
-- updated_at sees) with the value its last rebuild read, and skips when they
-- match. The counters are read BEFORE the rebuild, so a write during it makes
-- the next run rebuild again. A stats reset or a restart changes them, which
-- also forces a rebuild. Counters are flushed with a lag of seconds, so a
-- write in the last moments before a run can wait one schedule longer: the
-- same staleness the schedule already allows.
--
-- Both functions are only called by pg_cron (no app callers, no anon or
-- authenticated EXECUTE). The rebuild bodies are unchanged.

create table if not exists public.cron_refresh_state (
    job          text primary key,
    fingerprint  bigint not null,
    refreshed_at timestamptz not null default now()
);
comment on table public.cron_refresh_state is
    'Last input fingerprint each scheduled rebuild ran for (refresh_customer_aggregates, refresh_tenant_public_stats). Internal: no client access.';
alter table public.cron_refresh_state enable row level security;
revoke all on table public.cron_refresh_state from anon, authenticated, public;

/** The orders table's cumulative write count, or null when the stats are unavailable. */
create or replace function public.orders_write_fingerprint()
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $function$
    select coalesce(n_tup_ins, 0) + coalesce(n_tup_upd, 0) + coalesce(n_tup_del, 0)
    from pg_stat_user_tables
    where relid = 'public.orders'::regclass;
$function$;
revoke all on function public.orders_write_fingerprint() from public, anon, authenticated;

/** True (and records `p_fingerprint`) when `p_job` must run; false when its input has not changed. */
create or replace function public.cron_refresh_due(p_job text, p_fingerprint bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_prev bigint;
begin
    if p_fingerprint is null then
        return true;
    end if;
    select fingerprint into v_prev from public.cron_refresh_state where job = p_job;
    return v_prev is distinct from p_fingerprint;
end;
$function$;
revoke all on function public.cron_refresh_due(text, bigint) from public, anon, authenticated;

create or replace function public.cron_refresh_done(p_job text, p_fingerprint bigint)
returns void
language sql
security definer
set search_path to 'public'
as $function$
    insert into public.cron_refresh_state (job, fingerprint, refreshed_at)
    select p_job, p_fingerprint, now()
    where p_fingerprint is not null
    on conflict (job) do update
        set fingerprint = excluded.fingerprint, refreshed_at = excluded.refreshed_at;
$function$;
revoke all on function public.cron_refresh_done(text, bigint) from public, anon, authenticated;

create or replace function public.refresh_customer_aggregates()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_fp bigint := public.orders_write_fingerprint();
begin
    if not public.cron_refresh_due('customer_aggregates', v_fp) then
        return;
    end if;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_aggregates;
    perform public.cron_refresh_done('customer_aggregates', v_fp);
end;
$function$;

-- The rebuild body below is the live definition, unchanged, moved into a
-- plpgsql function so it can be skipped. (Blank governorate codes are not
-- counted: nullif lets an empty validated code fall through to the raw one,
-- so 18 governorates never read as 19.) A null fingerprint (no stats) always
-- rebuilds rather than risk stale data.
create or replace function public.refresh_tenant_public_stats()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_fp bigint := public.orders_write_fingerprint();
begin
    if not public.cron_refresh_due('tenant_public_stats', v_fp) then
        return;
    end if;

    INSERT INTO public.tenant_public_stats AS s (
        tenant_id, completed_orders, customers,
        governorates_served, first_order_at, refreshed_at
    )
    SELECT
        o.tenant_id,
        count(*) FILTER (WHERE o.status = 'completed'),
        count(DISTINCT public.normalize_phone(o.phone))
            FILTER (WHERE o.phone IS NOT NULL AND o.phone <> ''),
        count(DISTINCT coalesce(
            nullif(o.validated_governorate_code, ''),
            nullif(o.governorate_code, '')
        )) FILTER (
            WHERE coalesce(
                nullif(o.validated_governorate_code, ''),
                nullif(o.governorate_code, '')
            ) IS NOT NULL
        ),
        min(o.created_at),
        now()
    FROM public.orders o
    WHERE o.tenant_id IS NOT NULL
        AND o.deleted_at IS NULL
        AND coalesce(o.is_test, false) = false
    GROUP BY o.tenant_id
    ON CONFLICT (tenant_id) DO UPDATE SET
        completed_orders    = EXCLUDED.completed_orders,
        customers           = EXCLUDED.customers,
        governorates_served = EXCLUDED.governorates_served,
        first_order_at      = EXCLUDED.first_order_at,
        refreshed_at        = EXCLUDED.refreshed_at;

    perform public.cron_refresh_done('tenant_public_stats', v_fp);
end;
$function$;
