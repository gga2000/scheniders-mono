-- Drop the five-argument admin_extend_trial (20261116011319). The six-argument
-- one (20261116021735) replaced it and needs a staff reason. The staff console
-- that called the old one is no longer in production: the 1a36d2f deploy calls
-- the new one. Nothing in the database or in cron calls the old one. After
-- this drop, no one can extend a trial without a reason.
--
-- Its tests moved from the by-hand tests/admin_extend_trial.sql into
-- tests/behaviour/billing-lock.test.sql, section 18.
--
-- Rollback: re-run the CREATE FUNCTION, REVOKE and GRANT statements of
--           20261116011319_admin_extend_trial_and_topup_key.sql.

DROP FUNCTION public.admin_extend_trial(uuid, integer, uuid, text, text);
