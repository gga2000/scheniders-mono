-- Defense-in-depth: pin search_path on the SECURITY DEFINER customer functions
-- (matches the repo's 20260518000000_security_definer_lockdown policy).
-- get_paginated_customers already pins it via its CREATE OR REPLACE; these two
-- are altered in place.
ALTER FUNCTION public.get_customer_dashboard_stats() SET search_path = public;
ALTER FUNCTION public.refresh_customer_aggregates() SET search_path = public;
