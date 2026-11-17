-- "Needs attention" (the Merchants filter and the digest's headline), round 11:
--   * a paused trial is still a trial: its days run and it locks at their end,
--     as tenant_effective_status says for every money rule (#1367). The trial
--     test read the raw status, so a paused trial ending tomorrow was not on
--     the list while Trials and the digest named it;
--   * "ending" is 3 days on the Baghdad calendar, the console's one rule
--     (lib/baghdad-day.ts TRIAL_ENDING_DAYS): a trial ending at 23:00 on the
--     third day is ending from that morning, not only within 72 hours.
-- The rest is unchanged: on hold or cancelled, under 5,000 IQD in the wallet,
-- or locked for an unpaid trial or month. Service role only.
CREATE OR REPLACE FUNCTION public.staff_needs_attention(shop public.tenants)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT shop.status IN ('suspended', 'cancelled')
      OR (public.tenant_effective_status(shop.status, shop.restrictions) = 'trial'
          AND shop.trial_ends_at IS NOT NULL
          AND (shop.trial_ends_at AT TIME ZONE 'Asia/Baghdad')::date <= (now() AT TIME ZONE 'Asia/Baghdad')::date + 3)
      OR public.staff_wallet_balance(shop) < 5000
      OR EXISTS (SELECT 1 FROM public.tenant_billing_lock(shop.id));
$$;

REVOKE ALL ON FUNCTION public.staff_needs_attention(public.tenants) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_needs_attention(public.tenants) TO service_role;
