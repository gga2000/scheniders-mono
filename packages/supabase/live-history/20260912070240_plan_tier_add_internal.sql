-- A house tier for tenants the platform owner runs itself (the Scheniders store).
-- It is never charged and never suspended, so the billing crons cannot lock the
-- operator out of their own dashboard over a wallet balance.
--
-- Deliberately NOT added to the self-serve plan lists in the app: a tenant must
-- never be able to move itself onto a free, unlimited plan.
alter type plan_tier add value if not exists 'internal';;
