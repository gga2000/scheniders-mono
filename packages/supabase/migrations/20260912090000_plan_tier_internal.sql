-- =============================================
-- `internal` plan tier — the operator's own house account
--
-- Scheniders runs its own store on this platform. On a paid tier that store is
-- billed like any customer, so an empty wallet put the subscription past_due, the
-- renewal cron set the tenant `suspended`, and TrialBanner's full-screen
-- "الحساب موقوف" overlay locked the operator out of their own dashboard.
--
-- This tier is never charged and never suspended. It is deliberately absent from
-- the self-serve plan lists in the app (`VALID_PLANS` in app/actions/billing.ts
-- and the signup route), so a tenant cannot move itself onto a free unlimited
-- plan — it is assigned in the database only.
--
-- NOTE: `alter type ... add value` must commit before the new label can be used,
-- so the plan_limits row lives in the follow-up migration, not this one.
-- =============================================

alter type plan_tier add value if not exists 'internal';
