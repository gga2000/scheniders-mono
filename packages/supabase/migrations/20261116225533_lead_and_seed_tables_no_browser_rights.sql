-- Lead and seed tables: no browser rights (staff console audit, round 4).
--
-- Eight staff-only tables still kept every table right for anon and
-- authenticated, the Supabase default for a new table: the sales leads and
-- their history, reminders, competitors and social links, the outreach
-- message templates, and the two tables behind seeded test orders. Row
-- security answers "false" to both roles on each of them, so nothing leaks
-- today; this takes the rights away as well, so a policy changed by mistake
-- cannot open them (leads holds prospects' names and phones). The staff
-- console reads and writes them with the service role only, and the seed
-- and lead functions run as their owner, so both keep working.
--
-- industries keeps its read: the merchant app's store setup lists the active
-- industries with the signed-in person's own key. Only its write rights go.

REVOKE ALL ON TABLE
    public.leads,
    public.lead_activities,
    public.lead_follow_ups,
    public.lead_competitors,
    public.lead_social_links,
    public.whatsapp_outreach_templates,
    public.order_generation_config,
    public.seed_customers
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.industries
FROM PUBLIC, anon, authenticated;
