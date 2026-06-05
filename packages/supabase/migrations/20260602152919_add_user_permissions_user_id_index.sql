-- AuthProvider queries user_permissions WHERE user_id = <uid> on every load.
-- Only the PK on id existed → seq scan. Add the missing FK/lookup index.
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions (user_id);
