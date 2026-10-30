-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1h — DRAFT config only
-- =====================================================================
-- The cart, checkout and thank-you pages in the redesigned product page's
-- voice. Plan: docs/superpowers/plans/2026-10-30-pdp-p1h-cart-checkout.md.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft (the `edits` list below: each patch merged
-- into the section's base with `||`, each `remove` key dropped with `-`,
-- `enabled` set when given):
--   cart      cart_line_items 2e4337a4         style "soft"
--   cart      cart_summary e5dbfa28            style "soft"; checkout_label_i18n
--                                              «كمّل طلبك» (was «متابعة الدفع»)
--   cart      trust_strip 78babd62             style "soft"; three pills in the
--                                              promise band's words (free delivery
--                                              is the receipt's row, not a pill)
--   cart      sticky_cta_bar aee18fed          enabled false (a second yellow
--                                              button over the summary's own)
--   checkout  checkout_form 561f48cc           style "soft"; submit_label_i18n
--                                              «ثبّت طلبي» (was the chrome
--                                              «أكّد الطلب»); the band's promise
--   checkout  checkout_order_summary 10bbe359  style "soft"; cod_note_i18n removed
--   checkout  trust_strip 4d0bc827             enabled false (every fact is on
--                                              the form or the receipt)
--   checkout_success order_confirmation 59bfb096  style "soft"; eta_i18n = the
--                                              product page's delivery claim
--                                              (Latin digits); whatsapp_label_i18n
--                                              «راسلنا واتساب»
--
-- Guards, in order, in one transaction:
--   a. no tenant / a listed page or section missing -> RAISE NOTICE and no
--      write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be aa676deb050743aef4cfec1511a73361
--      and store_config_rev must be 38 (the draft after the 1g migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 aa676deb050743aef4cfec1511a73361): drop
-- `style` from the six patched bases and `submit_label_i18n` from 561f48cc
-- with `-`; set enabled true on aee18fed and 4d0bc827; restore
--   e5dbfa28 checkout_label_i18n {"ar": "متابعة الدفع", "en": "Continue to checkout"};
--   78babd62 pills = 4d0bc827's pills (this file leaves them as they were);
--   561f48cc reassurance_text_i18n {"ar": "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.", "en": "Free inspection on delivery — pay only if you're happy."};
--   10bbe359 cod_note_i18n {"ar": "الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.", "en": "Cash on delivery — pay only after inspection."};
--   59bfb096 eta_i18n {"ar": "خلال ٢٤ ساعة من تثبيت الطلب", "en": "Within 24 hours of confirmation"} and
--            whatsapp_label_i18n {"ar": "تواصل معنا عبر واتساب", "en": "Message us on WhatsApp"}.
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := 'aa676deb050743aef4cfec1511a73361';
  -- edits:begin
  c_edits constant jsonb := $json$[
    {"page": "cart", "id": "2e4337a4-87ae-478d-98b6-5f361a404562", "patch": {"style": "soft"}},
    {"page": "cart", "id": "e5dbfa28-5c29-4f8b-810a-b5fe2baf1d2c", "patch": {
      "style": "soft",
      "checkout_label_i18n": {"ar": "كمّل طلبك", "en": "Finish your order"}
    }},
    {"page": "cart", "id": "78babd62-1484-48f1-8ed9-90e4fbc198a2", "patch": {
      "style": "soft",
      "pills": [
        {"bg": "mint", "icon": "payments", "label_i18n": {"ar": "الدفع عند الاستلام", "en": "Cash on delivery"}},
        {"bg": "sky", "icon": "visibility", "label_i18n": {"ar": "تفتح وتجرّب قبل لا تدفع", "en": "Open it and try it before you pay"}},
        {"bg": "lilac", "icon": "undo", "label_i18n": {
          "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
          "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
        }}
      ]
    }},
    {"page": "cart", "id": "aee18fed-e7c6-4f3f-8257-9f1a60fb4a3c", "patch": {}, "enabled": false},
    {"page": "checkout", "id": "561f48cc-7a08-4a8e-bb9f-b76a4ad8c26a", "patch": {
      "style": "soft",
      "submit_label_i18n": {"ar": "ثبّت طلبي", "en": "Place my order"},
      "reassurance_text_i18n": {
        "ar": "تفتح وتجرّب قبل لا تدفع — ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
        "en": "Open it and try it before you pay. Don't like it? Refuse it in front of the courier, or return it within a week."
      }
    }},
    {"page": "checkout", "id": "10bbe359-3565-43f7-883a-da6607379b87", "patch": {"style": "soft"}, "remove": ["cod_note_i18n"]},
    {"page": "checkout", "id": "4d0bc827-8914-4505-b018-10edaef38130", "patch": {}, "enabled": false},
    {"page": "checkout_success", "id": "59bfb096-e8ab-4503-b2ab-def24113ec07", "patch": {
      "style": "soft",
      "eta_i18n": {"ar": "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب", "en": "Most orders arrive within 24 hours of confirmation"},
      "whatsapp_label_i18n": {"ar": "راسلنا واتساب", "en": "Message us on WhatsApp"}
    }}
  ]$json$;
  -- edits:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_found int;
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1h: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT count(*) INTO v_found
    FROM jsonb_to_recordset(c_edits) AS e(page text, id text)
   WHERE EXISTS (
     SELECT 1
       FROM jsonb_array_elements(v_draft->'pages') AS pg(page),
            jsonb_array_elements(pg.page->'sections') AS s(sec)
      WHERE pg.page->>'page_id' = e.page AND s.sec->>'id' = e.id
   );
  IF v_found <> jsonb_array_length(c_edits) THEN
    RAISE NOTICE 'pdp redesign 1h: % of % sections found, nothing written', v_found, jsonb_array_length(c_edits);
    RETURN;
  END IF;

  -- The transform. tmp/pdp-1h/dryrun-1h.sql runs this same expression as
  -- a SELECT over the live row.
  SELECT jsonb_set(v_draft, '{pages}', (
           SELECT jsonb_agg(
                    CASE WHEN pg.page->>'page_id' IN (SELECT x.page FROM jsonb_to_recordset(c_edits) AS x(page text))
                      THEN jsonb_set(pg.page, '{sections}', (
                             SELECT jsonb_agg(
                                      CASE WHEN e.id IS NULL THEN s.sec
                                        ELSE jsonb_set(
                                               CASE WHEN e.enabled IS NULL THEN s.sec
                                                 ELSE jsonb_set(s.sec, '{enabled}', to_jsonb(e.enabled)) END,
                                               '{base}',
                                               (coalesce(s.sec->'base', '{}'::jsonb) || e.patch)
                                                 - coalesce(e.remove, '{}'::text[]))
                                      END
                                      ORDER BY s.ord)
                               FROM jsonb_array_elements(pg.page->'sections') WITH ORDINALITY AS s(sec, ord)
                               LEFT JOIN jsonb_to_recordset(c_edits)
                                      AS e(page text, id text, patch jsonb, remove text[], enabled boolean)
                                 ON e.page = pg.page->>'page_id' AND e.id = s.sec->>'id'))
                      ELSE pg.page
                    END
                    ORDER BY pg.ord)
             FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS pg(page, ord)))
    INTO v_target;

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1h: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1h: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1h: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1h: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1h: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
