-- End of the staff console audit (rounds 1 to 25, 16 to 23 Nov 2026).
--
-- Switches off the Claude audit login's staff row, as
-- 20261116003422_admin_console_audit_login said a later migration would, and
-- ends every sign-in session of that account (its refresh tokens go with
-- them), so nothing it still holds opens the console again. Turning it back
-- on is one more migration that sets is_active = true.
--
-- Looked up by email so the file holds no account id; does nothing when the
-- account does not exist.

update public.admin_users a
set is_active = false,
    updated_at = now()
from auth.users u
where a.user_id = u.id
  and u.email = 'claude@scheniders.com';

delete from auth.sessions s
using auth.users u
where s.user_id = u.id
  and u.email = 'claude@scheniders.com';