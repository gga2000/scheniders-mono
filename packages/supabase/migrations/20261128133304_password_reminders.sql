-- A reminder to pick a stronger password (Ali, 28 Nov 2026).
--
-- Sign-up and the new-password page now take any password Supabase Auth
-- takes (8+ characters, not a known leak). One the page calls weak is kept,
-- and a week later its owner is asked to change it to a stronger one.
--
-- One row per account, not per store: a password belongs to the person, who
-- may work in several stores. That is narrower than tenant scoping: only the
-- person reads their own row, and teammates (who can read each other's
-- user_profiles) never learn whose password is weak. Only the server
-- (service role) writes: the sign-up route, the new-password route and the
-- "remind me later" route, each for the signed-in person only.

create table public.password_reminders (
    user_id uuid primary key references auth.users (id) on delete cascade,
    -- When the app starts asking. Moved a week on by "remind me later";
    -- the row is deleted once the password is changed to one not called weak.
    remind_at timestamptz not null,
    created_at timestamptz not null default now()
);

alter table public.password_reminders enable row level security;

create policy password_reminders_read_own
    on public.password_reminders
    for select
    to authenticated
    using (user_id = (select auth.uid()));

revoke all on public.password_reminders from anon;
revoke insert, update, delete, truncate on public.password_reminders from authenticated;

comment on table public.password_reminders is
    'Per account: when to ask its owner to replace a weak password. Owner reads own row; service role writes.';
