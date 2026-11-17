-- Behaviour test for admin_build_prospect_store (staff console audit,
-- rounds 6 and 7) and convert_lead_atomic (round 8), run against the newest
-- definitions in
-- packages/supabase/migrations (run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   one call writes the shop (30-day trial, prospect, the lead's phone and
--   place), its products in the order sent, its wallet, the lead's link and
--   "store_built", one history line and one staff log row;
--   a name with no Latin letters gets a "store-" web address;
--   the form's business name, web address, industry and description are
--   used (round 7); a long name makes an address of at most 49 characters;
--   an unknown industry or an over-long field is refused;
--   a second build, a converted lead and a lead with a shop already are
--   refused and write nothing;
--   a product the database refuses undoes the whole build;
--   only the service role may call it;
--   the build passes the live triggers on the rows it writes, and they do
--   their part: each priced product gets its first price line and a
--   "created" line, and the lead's score counts its new store (round 7);
--   converting a lead makes its web address by the same rule as Build Store
--   (store_address_base: cut at 40, "store-" for Arabic only), with its
--   wallet, 30-day subscription, history line and owner's pending
--   commission; a prospect shop is turned into the merchant; a second
--   convert writes nothing; only the service role may convert (round 8).

\set ON_ERROR_STOP 1

-- The live triggers that fire on what the build writes (pg_trigger,
-- 2026-11-17), bound to the newest trigger functions. Triggers that fire only
-- on an update or delete of shops, products or wallets are left out: the
-- build only inserts those rows.
CREATE TRIGGER tenants_slug_not_in_foreign_history BEFORE INSERT OR UPDATE OF slug ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.tenants_slug_not_in_foreign_history();
CREATE TRIGGER tenants_strip_capi_keys BEFORE INSERT OR UPDATE OF store_config_v2, store_config_v2_draft ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.tenants_strip_capi_keys();
CREATE TRIGGER trg_refuse_new_restarting_clocks BEFORE INSERT OR UPDATE OF store_config_v2, store_config_v2_draft ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.refuse_new_restarting_clocks('store_config_v2', 'store_config_v2_draft');
CREATE TRIGGER trg_tenants_is_demo_guard BEFORE INSERT OR UPDATE OF is_demo ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.tenants_is_demo_guard();
CREATE TRIGGER trg_trial_check AFTER INSERT OR UPDATE OF contact_phone, contact_email ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.trial_check_on_change();
CREATE TRIGGER guard_products_category_same_tenant BEFORE INSERT OR UPDATE OF category_id, tenant_id ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_category_same_tenant();
CREATE TRIGGER guard_products_cost BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_cost_writes('cost', 'cost_breakdown_json');
CREATE TRIGGER log_product_price_change AFTER INSERT OR UPDATE OF price ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.log_product_price_change();
CREATE TRIGGER same_tenant_products_category_id_fkey BEFORE INSERT OR UPDATE OF category_id, tenant_id ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_same_tenant('category_id', 'categories', 'id', 'uuid');
CREATE TRIGGER trg_enforce_product_block BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.enforce_product_block();
CREATE TRIGGER trg_log_product_activity AFTER INSERT OR UPDATE OF name, sku, price, compare_at_price, website_price, status, is_visible, is_archived, image_url, category_id ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.log_product_activity();
CREATE TRIGGER trg_products_sync_archive_state BEFORE INSERT OR UPDATE OF is_archived, status ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.products_sync_archive_state();
CREATE TRIGGER trg_leads_before_upsert BEFORE INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_before_upsert();
CREATE TRIGGER trg_leads_after_upsert AFTER INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_after_upsert();
CREATE TRIGGER trg_leads_freeze_conversion_attribution BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_freeze_conversion_attribution();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.tenants
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.products
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.wallet
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.leads
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.lead_activities
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.admin_activity_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.subscriptions
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.admin_commission_config
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();
CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.admin_employee_commissions
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();

INSERT INTO public.leads (id, merchant_name, status, page_phone, phone_numbers, address, city, converted_tenant_id) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Kut Perfumes', 'contacted', '', '[{"title": "Sales", "number": "07701234568"}]', 'Main street', 'Kut', NULL),
  ('b0000000-0000-4000-8000-000000000002', 'عطور الكوت', 'new', '07701234567', '[]', NULL, NULL, NULL),
  ('b0000000-0000-4000-8000-000000000003', 'Converted', 'converted', NULL, '[]', NULL, NULL, 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'Has a shop', 'contacted', NULL, '[]', NULL, NULL, NULL),
  ('b0000000-0000-4000-8000-000000000005', 'Bad price', 'new', NULL, '[]', NULL, NULL, NULL),
  ('b0000000-0000-4000-8000-000000000006', 'NATTY FASHION', 'new', NULL, '[]', NULL, NULL, NULL),
  ('b0000000-0000-4000-8000-000000000007', 'Long name', 'new', NULL, '[]', NULL, NULL, NULL),
  ('b0000000-0000-4000-8000-000000000008', 'Kut Shoes', 'new', NULL, '[]', NULL, NULL, NULL);
INSERT INTO public.industries (id, name) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Fashion');
INSERT INTO public.tenants (business_name, slug, prospect_lead_id, is_prospect) VALUES
  ('Has a shop', 'has-a-shop-1', 'b0000000-0000-4000-8000-000000000004', true);

DO $t$
DECLARE
    karrar constant uuid := 'a0000000-0000-4000-8000-00000000000a';
    l1 constant uuid := 'b0000000-0000-4000-8000-000000000001';
    l2 constant uuid := 'b0000000-0000-4000-8000-000000000002';
    l3 constant uuid := 'b0000000-0000-4000-8000-000000000003';
    l4 constant uuid := 'b0000000-0000-4000-8000-000000000004';
    l5 constant uuid := 'b0000000-0000-4000-8000-000000000005';
    l6 constant uuid := 'b0000000-0000-4000-8000-000000000006';
    l7 constant uuid := 'b0000000-0000-4000-8000-000000000007';
    l8 constant uuid := 'b0000000-0000-4000-8000-000000000008';
    fashion constant uuid := 'd0000000-0000-4000-8000-000000000001';
    answer jsonb;
    shop public.tenants%ROWTYPE;
    lead public.leads%ROWTYPE;
    n integer;
    names text;
BEGIN
    answer := public.admin_build_prospect_store(
        l1, 'perfume', '#1E1E1E',
        '[{"name": " Oud ", "price": 25000, "description": "Night scent"}, {"name": "Musk", "price": 15000, "image_url": "https://x.test/m.png"}]',
        karrar, 'karrar@x.test');
    IF answer->>'success' <> 'true' THEN RAISE EXCEPTION 'build: %', answer; END IF;
    SELECT * INTO shop FROM public.tenants WHERE id = (answer->>'tenant_id')::uuid;
    IF shop.slug <> answer->>'slug' OR shop.slug !~ '^kut-perfumes-[0-9a-f]{8}$' THEN RAISE EXCEPTION 'web address: %', shop.slug; END IF;
    IF shop.business_name <> 'Kut Perfumes' OR shop.plan <> 'starter' OR shop.status <> 'trial' OR NOT shop.is_prospect
       OR shop.prospect_lead_id <> l1 THEN RAISE EXCEPTION 'shop row: %', to_jsonb(shop); END IF;
    IF shop.trial_ends_at < now() + interval '30 days' - interval '1 minute'
       OR shop.trial_ends_at > now() + interval '30 days' + interval '1 minute' THEN
        RAISE EXCEPTION 'trial is not 30 days: %', shop.trial_ends_at;
    END IF;
    -- The page phone is blank, so the first listed number is the shop's.
    IF shop.contact_phone <> '07701234568' OR shop.address <> 'Main street' OR shop.city <> 'Kut' THEN
        RAISE EXCEPTION 'phone or place: %', to_jsonb(shop);
    END IF;
    IF shop.branding <> '{"logo_url": null, "primary_color": "#1E1E1E", "secondary_color": "#8b5cf6"}'
       OR shop.settings <> '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}'
       OR shop.metadata <> '{"template": "perfume", "created_from_lead": true}' THEN
        RAISE EXCEPTION 'branding, settings or metadata: %', to_jsonb(shop);
    END IF;
    SELECT string_agg(name || ':' || price || ':' || status || ':' || display_order || ':' || coalesce(description, '-') || ':' || coalesce(image_url, '-'), ' | ' ORDER BY display_order)
      INTO names FROM public.products WHERE tenant_id = shop.id;
    IF names <> 'Oud:25000:active:0:Night scent:- | Musk:15000:active:1:-:https://x.test/m.png' THEN
        RAISE EXCEPTION 'products: %', names;
    END IF;
    SELECT count(*) INTO n FROM public.wallet WHERE tenant_id = shop.id AND balance_iqd = 0 AND threshold_iqd = 5000;
    IF n <> 1 THEN RAISE EXCEPTION 'wallet missing'; END IF;
    SELECT * INTO lead FROM public.leads WHERE id = l1;
    IF lead.prospect_tenant_id <> shop.id OR lead.status <> 'store_built' OR lead.store_built_at IS NULL THEN
        RAISE EXCEPTION 'lead not linked: %', to_jsonb(lead);
    END IF;
    SELECT count(*) INTO n FROM public.lead_activities
    WHERE lead_id = l1 AND activity_type = 'store_created' AND title = 'Prospect store created: ' || shop.slug
      AND metadata = jsonb_build_object('tenant_id', shop.id, 'slug', shop.slug, 'template', 'perfume')
      AND created_by = karrar;
    IF n <> 1 THEN RAISE EXCEPTION 'history line missing'; END IF;
    SELECT count(*) INTO n FROM public.admin_activity_logs
    WHERE action = 'build_store_for_lead' AND admin_user_id = karrar AND actor_email = 'karrar@x.test'
      AND admin_label IS NULL AND tenant_id = shop.id
      AND details = jsonb_build_object('lead_id', l1, 'slug', shop.slug);
    IF n <> 1 THEN RAISE EXCEPTION 'staff log row missing'; END IF;
    -- The live triggers ran on what the build wrote.
    SELECT string_agg(h.new_price || ':' || h.reason, ' | ' ORDER BY h.new_price) INTO names
      FROM public.product_price_history h JOIN public.products p ON p.id = h.product_id
     WHERE p.tenant_id = shop.id AND h.tenant_id = shop.id AND h.old_price IS NULL;
    IF names <> '15000:Initial price | 25000:Initial price' THEN RAISE EXCEPTION 'first prices: %', names; END IF;
    SELECT count(*) INTO n FROM public.product_activity_log WHERE tenant_id = shop.id AND action = 'created';
    IF n <> 2 THEN RAISE EXCEPTION 'product "created" lines: %', n; END IF;
    IF lead.score_breakdown ->> 'store' <> '10' THEN
        RAISE EXCEPTION 'the lead''s score does not count its store: %', lead.score_breakdown;
    END IF;

    -- No Latin letters, no colour, no products: a "store-" address, the page phone, the default colour.
    answer := public.admin_build_prospect_store(l2, 'general', NULL, '[]', karrar, 'karrar@x.test');
    SELECT * INTO shop FROM public.tenants WHERE id = (answer->>'tenant_id')::uuid;
    IF shop.slug !~ '^store-[0-9a-f]{8}$' THEN RAISE EXCEPTION 'Arabic name address: %', shop.slug; END IF;
    IF shop.contact_phone <> '07701234567' OR shop.branding->>'primary_color' <> '#3b82f6' THEN
        RAISE EXCEPTION 'Arabic name shop: %', to_jsonb(shop);
    END IF;

    -- Refusals write nothing.
    SELECT count(*) INTO n FROM public.tenants;
    answer := public.admin_build_prospect_store(l1, 'general', NULL, '[]', karrar, NULL);
    IF answer <> '{"success": false, "error": "store_exists"}' THEN RAISE EXCEPTION 'second build: %', answer; END IF;
    answer := public.admin_build_prospect_store(l3, 'general', NULL, '[]', karrar, NULL);
    IF answer <> '{"success": false, "error": "converted"}' THEN RAISE EXCEPTION 'converted: %', answer; END IF;
    answer := public.admin_build_prospect_store(l4, 'general', NULL, '[]', karrar, NULL);
    IF answer <> '{"success": false, "error": "store_exists"}' THEN RAISE EXCEPTION 'shop by prospect_lead_id: %', answer; END IF;
    answer := public.admin_build_prospect_store('b0000000-0000-4000-8000-0000000000ff', 'general', NULL, '[]', karrar, NULL);
    IF answer <> '{"success": false, "error": "not_found"}' THEN RAISE EXCEPTION 'no lead: %', answer; END IF;
    answer := public.admin_build_prospect_store(l5, 'general', 'red', '[]', karrar, NULL);
    IF answer <> '{"success": false, "error": "bad_input"}' THEN RAISE EXCEPTION 'bad colour: %', answer; END IF;
    answer := public.admin_build_prospect_store(l5, ' ', NULL, '[]', karrar, NULL);
    IF answer <> '{"success": false, "error": "bad_input"}' THEN RAISE EXCEPTION 'no template: %', answer; END IF;
    answer := public.admin_build_prospect_store(l5, 'general', NULL,
        (SELECT jsonb_agg(jsonb_build_object('name', 'P' || i, 'price', 1)) FROM generate_series(1, 11) i), karrar, NULL);
    IF answer <> '{"success": false, "error": "bad_input"}' THEN RAISE EXCEPTION '11 products: %', answer; END IF;
    IF (SELECT count(*) FROM public.tenants) <> n THEN RAISE EXCEPTION 'a refusal made a shop'; END IF;

    -- A price with fils is refused by the database: nothing of the build stays.
    BEGIN
        PERFORM public.admin_build_prospect_store(l5, 'general', NULL, '[{"name": "Half", "price": 1500.5}]', karrar, NULL);
        RAISE EXCEPTION 'a fractional price was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    IF (SELECT count(*) FROM public.tenants) <> n
       OR EXISTS (SELECT 1 FROM public.leads WHERE id = l5 AND (prospect_tenant_id IS NOT NULL OR status <> 'new'))
       OR EXISTS (SELECT 1 FROM public.lead_activities WHERE lead_id = l5)
       OR (SELECT count(*) FROM public.wallet) <> 2
       OR (SELECT count(*) FROM public.admin_activity_logs) <> 2 THEN
        RAISE EXCEPTION 'a failed build left rows behind';
    END IF;

    -- The form's name, web address, industry and description are used.
    answer := public.admin_build_prospect_store(
        _lead_id => l6, _template => 'fashion', _admin_user_id => karrar, _actor_email => 'karrar@x.test',
        _business_name => ' Zara Baghdad ', _address => 'Zara Baghdad!!', _industry_id => fashion,
        _description => ' Women''s clothes ');
    IF answer->>'success' <> 'true' THEN RAISE EXCEPTION 'form build: %', answer; END IF;
    SELECT * INTO shop FROM public.tenants WHERE id = (answer->>'tenant_id')::uuid;
    IF shop.business_name <> 'Zara Baghdad' OR shop.slug !~ '^zara-baghdad-[0-9a-f]{8}$'
       OR shop.metadata <> jsonb_build_object('template', 'fashion', 'created_from_lead', true,
                                              'industry_id', fashion, 'description', 'Women''s clothes') THEN
        RAISE EXCEPTION 'form fields not used: %', to_jsonb(shop);
    END IF;

    -- A long name is cut at 40 characters, with no "-" left at the cut.
    answer := public.admin_build_prospect_store(
        _lead_id => l7, _template => 'general', _admin_user_id => karrar,
        _business_name => 'The best shoes and bags shop in all of Baghdad and Basra');
    SELECT * INTO shop FROM public.tenants WHERE id = (answer->>'tenant_id')::uuid;
    IF shop.slug !~ '^the-best-shoes-and-bags-shop-in-all-of-b-[0-9a-f]{8}$' OR length(shop.slug) > 49
       OR shop.business_name <> 'The best shoes and bags shop in all of Baghdad and Basra' THEN
        RAISE EXCEPTION 'long name address: %', shop.slug;
    END IF;

    -- Refused before anything is written: an unknown industry, over-long fields.
    SELECT count(*) INTO n FROM public.tenants;
    answer := public.admin_build_prospect_store(_lead_id => l8, _template => 'general',
        _industry_id => 'd0000000-0000-4000-8000-0000000000ff');
    IF answer <> '{"success": false, "error": "bad_input"}' THEN RAISE EXCEPTION 'unknown industry: %', answer; END IF;
    answer := public.admin_build_prospect_store(_lead_id => l8, _template => 'general', _address => repeat('a', 61));
    IF answer <> '{"success": false, "error": "bad_input"}' THEN RAISE EXCEPTION 'long address: %', answer; END IF;
    answer := public.admin_build_prospect_store(_lead_id => l8, _template => 'general', _business_name => repeat('a', 201));
    IF answer <> '{"success": false, "error": "bad_input"}' THEN RAISE EXCEPTION 'long name: %', answer; END IF;
    answer := public.admin_build_prospect_store(_lead_id => l8, _template => 'general', _description => repeat('a', 2001));
    IF answer <> '{"success": false, "error": "bad_input"}' THEN RAISE EXCEPTION 'long description: %', answer; END IF;
    IF (SELECT count(*) FROM public.tenants) <> n THEN RAISE EXCEPTION 'a refused form made a shop'; END IF;

    -- A blank name keeps the lead's; an address with no Latin letters gets "store-".
    answer := public.admin_build_prospect_store(_lead_id => l8, _template => 'general',
        _business_name => '  ', _address => 'أحذية الكوت');
    SELECT * INTO shop FROM public.tenants WHERE id = (answer->>'tenant_id')::uuid;
    IF shop.business_name <> 'Kut Shoes' OR shop.slug !~ '^store-[0-9a-f]{8}$' OR shop.metadata ? 'description' THEN
        RAISE EXCEPTION 'blank name or Arabic address: %', to_jsonb(shop);
    END IF;

    -- Only the service role may call it.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_build_prospect_store(l5, 'general', NULL, '[]', karrar, NULL);
        RAISE EXCEPTION 'a signed-in browser built a store';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$t$;

-- Converting a lead (convert_lead_atomic) makes the web address by the same
-- rule as Build Store.
INSERT INTO public.user_profiles (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000b', 'noor@x.test');
INSERT INTO public.admin_commission_config (id, name, is_active) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'Per order', true);
INSERT INTO public.leads (id, merchant_name, status, assigned_to) VALUES
  ('b0000000-0000-4000-8000-000000000011', 'The best shoes and bags shop in all of Baghdad and Basra', 'interested',
   'a0000000-0000-4000-8000-00000000000b'),
  ('b0000000-0000-4000-8000-000000000012', 'عطور النجف', 'interested', NULL);

DO $c$
DECLARE
    karrar constant uuid := 'a0000000-0000-4000-8000-00000000000a';
    noor constant uuid := 'a0000000-0000-4000-8000-00000000000b';
    l1 constant uuid := 'b0000000-0000-4000-8000-000000000001';
    c1 constant uuid := 'b0000000-0000-4000-8000-000000000011';
    c2 constant uuid := 'b0000000-0000-4000-8000-000000000012';
    answer jsonb;
    again jsonb;
    shop public.tenants%ROWTYPE;
    lead public.leads%ROWTYPE;
    prospect uuid;
    n integer;
BEGIN
    -- The one copy of the steps, with the console's own cases.
    IF public.store_address_base('NATTY FASHION') <> 'natty-fashion'
       OR public.store_address_base(' Zara Baghdad!! ') <> 'zara-baghdad'
       OR public.store_address_base('abcdefghij abcdefghij abcdefghij abcdefg xyz') <> 'abcdefghij-abcdefghij-abcdefghij-abcdefg'
       OR public.store_address_base('النمور ستور') <> 'store'
       OR public.store_address_base(NULL) <> 'store' THEN
        RAISE EXCEPTION 'store_address_base steps';
    END IF;

    -- A long Latin name is cut at 40, so the address fits a web address part.
    answer := public.convert_lead_atomic(c1, karrar, ' Signed on the call ');
    IF answer->>'outcome' <> 'converted' THEN RAISE EXCEPTION 'convert: %', answer; END IF;
    SELECT * INTO shop FROM public.tenants WHERE id = (answer->>'tenant_id')::uuid;
    IF shop.slug !~ '^the-best-shoes-and-bags-shop-in-all-of-b-[0-9a-f]{8}$' OR length(shop.slug) > 49 THEN
        RAISE EXCEPTION 'converted long name address: %', shop.slug;
    END IF;
    IF shop.business_name <> 'The best shoes and bags shop in all of Baghdad and Basra' OR shop.plan <> 'starter'
       OR shop.status <> 'active' OR shop.is_prospect OR shop.prospect_lead_id <> c1 THEN
        RAISE EXCEPTION 'converted shop row: %', to_jsonb(shop);
    END IF;
    SELECT count(*) INTO n FROM public.wallet WHERE tenant_id = shop.id AND balance_iqd = 0 AND threshold_iqd = 5000;
    IF n <> 1 THEN RAISE EXCEPTION 'converted wallet missing'; END IF;
    SELECT count(*) INTO n FROM public.subscriptions
    WHERE tenant_id = shop.id AND plan = 'starter' AND status = 'active'
      AND current_period_end - current_period_start = interval '30 days';
    IF n <> 1 THEN RAISE EXCEPTION 'converted subscription missing'; END IF;
    SELECT * INTO lead FROM public.leads WHERE id = c1;
    IF lead.converted_tenant_id <> shop.id OR lead.status <> 'converted' OR lead.converted_at IS NULL THEN
        RAISE EXCEPTION 'lead not converted: %', to_jsonb(lead);
    END IF;
    SELECT count(*) INTO n FROM public.lead_activities
    WHERE lead_id = c1 AND activity_type = 'conversion' AND description = 'Signed on the call'
      AND metadata = jsonb_build_object('tenant_id', shop.id, 'plan', 'starter') AND created_by = karrar;
    IF n <> 1 THEN RAISE EXCEPTION 'conversion history line missing'; END IF;
    SELECT count(*) INTO n FROM public.admin_employee_commissions
    WHERE admin_user_id = noor AND lead_id = c1 AND tenant_id = shop.id AND status = 'pending'
      AND commission_config_id = 'e0000000-0000-4000-8000-000000000001' AND amount_earned = 0;
    IF n <> 1 THEN RAISE EXCEPTION 'owner commission missing'; END IF;
    -- The new shop is a real merchant, so the one-trial check keeps its identifiers.
    IF (SELECT count(*) FROM public.test_fingerprint_calls WHERE tenant_id = shop.id) <> 1 THEN
        RAISE EXCEPTION 'one-trial check skipped the converted shop';
    END IF;

    -- A second convert finds the first one and writes nothing.
    again := public.convert_lead_atomic(c1, karrar, NULL);
    IF again <> jsonb_build_object('outcome', 'already_converted', 'tenant_id', shop.id) THEN
        RAISE EXCEPTION 'second convert: %', again;
    END IF;
    IF (SELECT count(*) FROM public.tenants WHERE prospect_lead_id = c1) <> 1
       OR (SELECT count(*) FROM public.subscriptions WHERE tenant_id = shop.id) <> 1
       OR (SELECT count(*) FROM public.admin_employee_commissions WHERE lead_id = c1) <> 1
       OR (SELECT count(*) FROM public.lead_activities WHERE lead_id = c1) <> 1 THEN
        RAISE EXCEPTION 'a second convert wrote rows';
    END IF;

    -- A name in Arabic letters only gets "store-"; no owner, no commission.
    answer := public.convert_lead_atomic(c2, karrar, NULL);
    SELECT * INTO shop FROM public.tenants WHERE id = (answer->>'tenant_id')::uuid;
    IF shop.slug !~ '^store-[0-9a-f]{8}$' THEN RAISE EXCEPTION 'converted Arabic name address: %', shop.slug; END IF;
    IF EXISTS (SELECT 1 FROM public.admin_employee_commissions WHERE lead_id = c2) THEN
        RAISE EXCEPTION 'a lead with no owner made a commission';
    END IF;

    -- A lead with a prospect shop keeps that shop and its address.
    SELECT prospect_tenant_id INTO prospect FROM public.leads WHERE id = l1;
    answer := public.convert_lead_atomic(l1, karrar, NULL);
    SELECT * INTO shop FROM public.tenants WHERE id = prospect;
    IF (answer->>'tenant_id')::uuid <> prospect OR shop.is_prospect OR shop.status <> 'active'
       OR shop.slug !~ '^kut-perfumes-[0-9a-f]{8}$' THEN
        RAISE EXCEPTION 'prospect shop convert: % %', answer, to_jsonb(shop);
    END IF;

    -- Only the service role may convert.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.convert_lead_atomic('b0000000-0000-4000-8000-000000000008', karrar, NULL);
        RAISE EXCEPTION 'a signed-in browser converted a lead';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$c$;

-- The browser roles have no EXECUTE.
DO $g$
BEGIN
    IF has_function_privilege('authenticated', 'public.store_address_base(text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.store_address_base(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can call store_address_base';
    END IF;
    IF has_function_privilege('authenticated', 'public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text, text, text, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text, text, text, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can call admin_build_prospect_store';
    END IF;
    -- The six-argument version is gone, so a call with six names has one target.
    IF to_regprocedure('public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text)') IS NOT NULL THEN
        RAISE EXCEPTION 'the old six-argument function is still there';
    END IF;
END;
$g$;
