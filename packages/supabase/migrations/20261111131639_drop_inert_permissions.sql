-- Ali, 11 Nov (pick 5A): the team screens showed four switches that gated
-- nothing. Which pages a member opens is set by their role
-- (lib/route-permissions.ts), so turning these off changed nothing. They are
-- gone from the app; their rows go too so the matrix and the data agree.
-- No policy or function reads them, and no member had an override for them.
DELETE FROM public.role_permissions
 WHERE permission IN ('orders.view', 'customers.view', 'system.users.manage', 'system.analytics.view');
DELETE FROM public.user_permissions
 WHERE permission IN ('orders.view', 'customers.view', 'system.users.manage', 'system.analytics.view');
