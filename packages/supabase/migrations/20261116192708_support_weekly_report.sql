-- Merchant support, wave 6: the weekly support report on super admins' phones.
--
-- Every Sunday at 10 AM Baghdad (07:00 UTC; Iraq keeps UTC+3 all year), the
-- super admins who turned on phone alerts get the last 7 days in four numbers:
-- questions, typical first reply, solved, and how many said "not solved".
-- Tapping it opens the scoreboard. The numbers are support_scoreboard(7), so
-- the demo store never counts.
--
-- Delivery goes through the send-staff-push edge function (kind "weekly"),
-- like the other staff alerts. With nobody to send to, nothing is queued.

create function public.support_weekly_report()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_url        text;
    v_secret     text;
    v_recipients uuid[];
    v_board      jsonb;
begin
    select c.staff_function_url, c.edge_secret into v_url, v_secret
    from public.chat_push_config c where c.id = 1;
    if v_url is null or v_secret is null then return 0; end if;

    select array_agg(distinct a.user_id) into v_recipients
    from public.admin_users a
    where a.is_active
      and a.admin_role = 'super_admin'
      and exists (select 1 from public.admin_push_subscriptions s where s.admin_user_id = a.user_id);
    if v_recipients is null then return 0; end if;

    v_board := public.support_scoreboard(7);

    perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_secret),
        body    := jsonb_build_object(
            'kind',                 'weekly',
            'opened',               v_board->'opened',
            'first_reply_median_s', v_board->'first_reply_median_s',
            'solved',               v_board->'solved',
            'rated_no',             v_board->'rated_no',
            'recipients',           to_jsonb(v_recipients))
    );
    return 1;
end;
$$;

revoke all on function public.support_weekly_report() from public, anon, authenticated;

select cron.schedule('support-weekly-report', '0 7 * * 0', 'SELECT public.support_weekly_report()');
