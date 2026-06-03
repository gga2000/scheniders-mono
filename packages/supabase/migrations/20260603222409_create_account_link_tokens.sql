-- Single-use, short-lived tokens for admin-initiated "link Google to an existing
-- account" (Flow A). The claim route exchanges a valid token for a magic-link
-- session as the target user, then runs linkIdentity(google).
CREATE TABLE public.account_link_tokens (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token          text NOT NULL UNIQUE,
    target_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider       text NOT NULL DEFAULT 'google',
    created_by     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_link_tokens_token_idx ON public.account_link_tokens (token);

-- RLS enabled with NO policies → all client access denied; only the service-role
-- admin endpoint + claim route (which bypass RLS) can read/write these tokens.
ALTER TABLE public.account_link_tokens ENABLE ROW LEVEL SECURITY;
