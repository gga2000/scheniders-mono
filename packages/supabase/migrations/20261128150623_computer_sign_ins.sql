-- Sign in on a computer by scanning a code with the phone (Ali, 28 Nov 2026).
--
-- Most merchants sign up on a phone, from an ad. Setup goes on a laptop or
-- iPad, so the computer's sign-in page shows a QR code, like WhatsApp Web:
--
--   1. The computer asks for a sign-in request. It keeps a random secret and
--      the server keeps only the secret's hash. The QR code carries the
--      request's id, never the secret.
--   2. The phone, already signed in, scans the code and the person presses
--      yes. The request now names that person.
--   3. The computer, which has been asking with its secret, gets a session
--      for that person once, and the request is spent.
--
-- Nobody reads or writes this table but the server (service role): the
-- request is about a person's sign-in, not about a store's data, and neither
-- side needs to see a row. RLS is on with no policies, so the API keys see
-- nothing.

create table public.computer_sign_ins (
    id uuid primary key default gen_random_uuid(),
    -- sha256 (hex) of the computer's secret.
    secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now(),
    -- The code is good for scanning until then; the page asks for a new one.
    expires_at timestamptz not null,
    -- What the phone shows about the computer: "Chrome" on "Windows", and the
    -- country it asked from (ISO code), so a scan from abroad stands out.
    browser text not null default '',
    os text not null default '',
    country text check (country is null or country ~ '^[A-Z]{2}$'),
    -- Set once, by the phone's yes or no.
    approved_user_id uuid references auth.users (id) on delete cascade,
    approved_at timestamptz,
    declined_at timestamptz,
    -- Set once, when the computer receives its session.
    used_at timestamptz,
    constraint computer_sign_ins_one_answer check (approved_at is null or declined_at is null),
    constraint computer_sign_ins_approved_has_user check ((approved_at is null) = (approved_user_id is null))
);

alter table public.computer_sign_ins enable row level security;

revoke all on public.computer_sign_ins from anon, authenticated;

create index computer_sign_ins_created_at_idx on public.computer_sign_ins (created_at);
create index computer_sign_ins_approved_user_id_idx on public.computer_sign_ins (approved_user_id) where approved_user_id is not null;

comment on table public.computer_sign_ins is
    'Scan-to-sign-in requests from a computer sign-in page, approved from a signed-in phone. Service role only.';

-- A request lives minutes; a day later nothing can use it.
select cron.schedule(
    'prune-computer-sign-ins',
    '17 * * * *',
    $$delete from public.computer_sign_ins where created_at < now() - interval '1 day'$$
);
