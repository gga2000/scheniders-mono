-- Grant VIEW_FINANCIALS to Admin
insert into role_permissions (role, permission)
values ('admin', 'system.financials.view')
on conflict (role, permission) do nothing;

-- Revoke Analytics from Employee and Viewer (Enforce privacy)
delete from role_permissions 
where role in ('employee', 'viewer') 
and permission = 'system.analytics.view';

-- Ensure Admin has everything (just in case)
insert into role_permissions (role, permission)
select 'admin' as role, permission from (values 
  ('system.financials.view'), 
  ('system.analytics.view'), 
  ('system.settings.access'),
  ('system.users.manage')
) as t(permission)
on conflict (role, permission) do nothing;
