-- Hide five misattributed review copies on scheniders-iraq's Envoy Blue PDP (2026-10-22).
--
-- Five approved reviews exist twice, word for word and under the same author: once on
-- «ويفر انتنس» (Wayfarer Intense, 5e847790-11a5-439f-bace-c315e0ff1ae8) and once on
-- «انفوي بلو» (Envoy Blue, 6ab3bad7-e4dd-4f18-8c3b-746d095a2c93). The Wayfarer rows are the
-- originals:
--   * text: حازم السيد's review says «وهسة جربت الانتنس», naming Wayfarer Intense; no review
--     names Envoy;
--   * insertion order: the six Wayfarer rows were written in one transaction (xmin 327677,
--     heap slots 1-6); the five Envoy rows came later in another (xmin 358138, slots 12-16),
--     a copy of every Wayfarer review except eng. سيف. created_at is an identical seeded
--     value on both sides, so it cannot break the tie.
--
-- The Envoy copies move from 'approved' to 'rejected', the table's own moderation flag,
-- which every storefront read already honours (RLS reviews_public_read, listApprovedReviews,
-- GET /api/reviews all require status = 'approved'). Nothing is deleted. The merchant can
-- re-approve any row from /store/reviews, or run the rollback below. The only trigger on the
-- table is AFTER INSERT, so this UPDATE notifies nobody.
--
-- Rollback:
--   UPDATE public.product_reviews SET status = 'approved'
--    WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
--      AND product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'
--      AND id IN ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3', '6be14560-7809-4de2-b7f4-83446be2754f',
--                 '298a4ead-b293-422a-9bd2-d632f708c1df', '0f6041df-aca0-47a0-887f-c6d150e95c2a',
--                 '58c02050-6480-43f5-a81e-b857e008522a');

DO $$
DECLARE
    v_present int;
    v_hidden  int;
BEGIN
    SELECT count(*) INTO v_present
      FROM public.product_reviews
     WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
       AND id IN ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3', '6be14560-7809-4de2-b7f4-83446be2754f',
                  '298a4ead-b293-422a-9bd2-d632f708c1df', '0f6041df-aca0-47a0-887f-c6d150e95c2a',
                  '58c02050-6480-43f5-a81e-b857e008522a');

    -- A database without this tenant's data (local replay, a branch) has nothing to fix.
    IF v_present = 0 THEN
        RAISE NOTICE 'hide_misattributed_envoy_review_copies: rows not present, nothing to do';
        RETURN;
    END IF;

    UPDATE public.product_reviews r
       SET status = 'rejected'
     WHERE r.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
       AND r.product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'
       AND r.status = 'approved'
       AND r.id IN ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3', '6be14560-7809-4de2-b7f4-83446be2754f',
                    '298a4ead-b293-422a-9bd2-d632f708c1df', '0f6041df-aca0-47a0-887f-c6d150e95c2a',
                    '58c02050-6480-43f5-a81e-b857e008522a')
       -- only while the Wayfarer original is still there, word for word
       AND EXISTS (SELECT 1
                     FROM public.product_reviews o
                    WHERE o.tenant_id = r.tenant_id
                      AND o.product_id = '5e847790-11a5-439f-bace-c315e0ff1ae8'
                      AND o.status = 'approved'
                      AND o.author_name IS NOT DISTINCT FROM r.author_name
                      AND o.body IS NOT DISTINCT FROM r.body);
    GET DIAGNOSTICS v_hidden = ROW_COUNT;

    IF v_hidden <> 5 THEN
        RAISE EXCEPTION 'hide_misattributed_envoy_review_copies: expected 5 Envoy copies, matched %', v_hidden;
    END IF;
END $$;
