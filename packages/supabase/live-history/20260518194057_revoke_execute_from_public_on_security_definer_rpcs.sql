-- Phase 2 follow-up: REVOKE EXECUTE from PUBLIC (not just anon) and re-GRANT
-- selectively. The previous migration only revoked from anon/authenticated,
-- but Postgres functions inherit a PUBLIC grant on creation, so anon kept
-- access via the implicit role.

-- Step 1: REVOKE FROM PUBLIC on every SECURITY DEFINER RPC we want to lock.
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(jsonb)                                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(jsonb, uuid)                              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb)                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb, uuid)                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.charge_wallet_atomic(uuid, numeric, text, text)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_lead_score(uuid)                                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_order_usage(uuid)                                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_usage_tracking(uuid, integer, integer)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_customer_aggregates()                                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_seed_automation(boolean)                               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.progress_seed_orders()                                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_seed_orders()                                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_seed_automation_status()                                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid)                                         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tenant_block_active(uuid, text)                               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_tenant_id()                                       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_ids()                                         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_paginated_customers(text, text, text, text, boolean, integer, integer, bigint, bigint, integer, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_dashboard_stats()                                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_percentile(text, text)                           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_score_audit_log(text, integer, integer)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_trust_history(text, integer)                     FROM PUBLIC;

-- Step 2: re-GRANT to authenticated where the in-body tenant guard already
-- enforces membership — these are the platform's primary write/read paths.
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, uuid)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb, uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_wallet_atomic(uuid, numeric, text, text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_order_usage(uuid)                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage_tracking(uuid, integer, integer)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_customer_aggregates()                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid)                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_block_active(uuid, text)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id()                                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids()                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_customers(text, text, text, text, boolean, integer, integer, bigint, bigint, integer, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_dashboard_stats()                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_percentile(text, text)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_score_audit_log(text, integer, integer)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_trust_history(text, integer)                      TO authenticated;

-- Step 3: service_role retains EXECUTE on everything (it bypasses PUBLIC
-- revokes by virtue of being a superuser-equivalent in Supabase). No
-- explicit grants needed.

-- Step 4: leave deprecated/seeding functions ungranted to anon+authenticated —
-- only service_role can call them. Deprecated 1-arg/3-arg functions still
-- raise inside the body if called by a non-service-role even if granted.
;
