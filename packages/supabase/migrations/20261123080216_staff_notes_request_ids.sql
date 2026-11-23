-- Lead follow-ups, lead notes and shop notes carry a request id (staff
-- console audit, N8).
--
-- A follow-up, a note on a lead's timeline or a note on a shop whose answer
-- was lost (a 504, a dropped connection) was saved again when staff pressed
-- Save a second time. The console now sends one id per ask, the row keeps
-- it, and a second row with the same id is refused here, so the route
-- answers with the first row instead. Rows written without an id (by the
-- database's own steps) keep null; nulls never clash.

alter table public.lead_follow_ups add column request_id uuid;
alter table public.lead_activities add column request_id uuid;
alter table public.admin_notes add column request_id uuid;

create unique index lead_follow_ups_request_id_key on public.lead_follow_ups (request_id);
create unique index lead_activities_request_id_key on public.lead_activities (request_id);
create unique index admin_notes_request_id_key on public.admin_notes (request_id);