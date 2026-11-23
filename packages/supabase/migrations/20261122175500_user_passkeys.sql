-- Fermi: sign in with a passkey (fingerprint, Face ID, Windows Hello).
--
-- Supabase Auth has WebAuthn only as a second factor after a password, so the
-- platform keeps passkeys itself. /api/auth/passkey/* verifies the browser's
-- signature against the public key stored here and then opens an ordinary
-- Supabase session for that user.
--
-- A passkey belongs to a person (auth.users), not to a shop: it replaces the
-- password, and what the person may see is still decided by the same tenant
-- rules as any other session. Hence user_id and no tenant_id.
--
-- - user_passkeys: one row per registered device. A signed-in user may read
--   and delete their own rows. Only the service role writes: a row is added
--   after the server has verified the registration.
-- - passkey_challenges: the random value a browser must sign, used once and
--   gone after 5 minutes. Service role only.

create table public.user_passkeys (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    credential_id text not null unique,
    public_key text not null,
    counter bigint not null default 0,
    transports text[] not null default '{}',
    device_type text not null,
    backed_up boolean not null default false,
    label text not null default '',
    created_at timestamptz not null default now(),
    last_used_at timestamptz
);

create index user_passkeys_user_id_idx on public.user_passkeys (user_id);

alter table public.user_passkeys enable row level security;

create policy user_passkeys_select_own on public.user_passkeys
    for select to authenticated
    using (user_id = (select auth.uid()));

create policy user_passkeys_delete_own on public.user_passkeys
    for delete to authenticated
    using (user_id = (select auth.uid()));

revoke all on public.user_passkeys from anon, authenticated;
grant select, delete on public.user_passkeys to authenticated;
grant all on public.user_passkeys to service_role;

create table public.passkey_challenges (
    id uuid primary key default gen_random_uuid(),
    challenge text not null,
    purpose text not null check (purpose in ('register', 'signin')),
    user_id uuid references auth.users (id) on delete cascade,
    expires_at timestamptz not null default (now() + interval '5 minutes'),
    constraint passkey_challenges_register_has_user check (purpose <> 'register' or user_id is not null)
);

create index passkey_challenges_expires_at_idx on public.passkey_challenges (expires_at);

alter table public.passkey_challenges enable row level security;

revoke all on public.passkey_challenges from anon, authenticated;
grant all on public.passkey_challenges to service_role;
