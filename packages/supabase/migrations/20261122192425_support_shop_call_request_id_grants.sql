-- The shop call log takes only service-role calls, as before its request id.
revoke all on function public.support_log_shop_call(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.support_log_shop_call(uuid, uuid, text, text, text, text, uuid) to service_role;