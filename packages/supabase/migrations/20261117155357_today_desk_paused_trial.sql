-- The Today desk names a paused trial's end (staff console audit, round 12,
-- should-fix 2; agreed with the support thread 17 Nov).
--
-- support_tasks_due sent the shop's raw status, so a paused trial (status
-- limited) lost its "Trial ends" line on the Today desk, while "Needs us"
-- lists the same shop as "Trial ends soon" (support_shops_needing_us reads
-- tenant_effective_status). shop_status is now the status the money rules
-- read: a paused shop is what it was before the pause. Nothing else changes.
CREATE OR REPLACE FUNCTION public.support_tasks_due(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'kind', s.kind,
               'topic', s.topic,
               'due_at', s.due_at,
               'attempts', s.attempts,
               'phone', s.phone,
               'requested_by', s.requested_by_name,
               'tenant_id', t.id,
               'business_name', t.business_name,
               'display_id', t.display_id,
               'trial_ends_at', t.trial_ends_at,
               -- What the money rules read: a paused shop is what it was before.
               'shop_status', public.tenant_effective_status(t.status, t.restrictions)::text,
               'orders', (SELECT count(*) FROM public.admin_order_facts f WHERE f.tenant_id = t.id),
               'owner_id', o.admin_id,
               'owner_name', a.display_name,
               'calls', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                    'admin_name', c.admin_name, 'outcome', c.outcome,
                                    'note', c.note, 'created_at', c.created_at)
                                ORDER BY c.created_at DESC), '[]'::jsonb)
                         FROM (SELECT * FROM public.support_calls c
                               WHERE c.tenant_id = t.id
                               ORDER BY c.created_at DESC LIMIT 3) c))
             ORDER BY s.due_at, t.business_name, s.kind), '[]'::jsonb)
    FROM public.support_tasks s
    JOIN public.tenants t ON t.id = s.tenant_id
    LEFT JOIN public.support_shop_owners o ON o.tenant_id = t.id
    LEFT JOIN public.admin_users a ON a.user_id = o.admin_id
    WHERE s.done_at IS NULL
      AND t.is_demo IS NOT TRUE
      AND t.status::text <> 'cancelled'
      -- Due by the end of today, Baghdad time.
      AND s.due_at < (date_trunc('day', p_now AT TIME ZONE 'Asia/Baghdad') + interval '1 day') AT TIME ZONE 'Asia/Baghdad';
$$;