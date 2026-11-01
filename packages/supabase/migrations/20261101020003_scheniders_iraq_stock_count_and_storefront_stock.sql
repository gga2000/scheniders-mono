-- scheniders-iraq stock, as the merchant set it on 2026-11-01:
--   * the store shows a number between 1 and 30 for every perfume except انفوي,
--     بيرسيفيرون and فيوجن, generated once and written here (so a replay gives
--     the same numbers). Their real stock is 0 too, but that is set by a later
--     migration, applied only once the storefront reads storefront_stock —
--     before that, real 0 would show them all out of stock;
--   * out of stock (real 0, shown 0): نورث ستاك 1/2/4, فايبرنت, ديلايت, رفقات وايت;
--   * فيوجن: shown out of stock; its real count is left alone;
--   * بيرسيفيرون: 36 left, shown as 36;
--   * انفوي: no change — the store keeps showing its real stock.
-- Each real-stock change is recorded like adjust_product_stock does
-- (inventory_history + a manual: ledger row), so it shows in stock history.
-- Re-running is a no-op: rows already at the target are skipped.
-- One DO block = one transaction, so the plan table lives for every step.

DO $$
DECLARE
  v_tenant constant uuid := 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a';
  v_missing integer;
BEGIN
  CREATE TEMP TABLE _stock_plan (product_id uuid PRIMARY KEY, real_stock integer, shown integer) ON COMMIT DROP;
  INSERT INTO _stock_plan (product_id, real_stock, shown) VALUES
      ('d4bebf52-07b9-4314-bc8d-bc06c62d0222'::uuid, NULL, 20), -- إيلانيا
      ('9e66b31f-17dc-4695-989e-81e21663dad3'::uuid, NULL, 12), -- اوشن
      ('f1eb77e9-d9b0-4238-a331-d621fbbc92ec'::uuid, NULL, 24), -- ايبسكو
      ('02a67e80-4a98-4fb5-91a6-5a866b40b56d'::uuid, NULL,  6), -- ايدنتتي
      ('736371d3-b360-490a-be22-cfbc5a60c080'::uuid, NULL, 23), -- ايشال فانيلا
      ('38decc96-86fd-415d-b210-d48252e3333f'::uuid, NULL, 10), -- ايشال مسك
      ('65be51d4-7ac7-411f-b5f4-e2026ba6d9fe'::uuid, NULL, 24), -- بستاشيو
      ('bb78a023-6534-42e6-bc83-6d0909a841e5'::uuid, NULL, 14), -- بيتش ديلولو
      ('316054dc-f479-468a-9eb6-39b6cad4b5da'::uuid, NULL, 11), -- بير بوشن
      ('7bbff454-17c5-4123-a9da-fac192fe7895'::uuid, NULL,  8), -- بين الأسرار
      ('fc1a3c54-ea47-4008-b0f2-a5d4c7a3ba6b'::uuid, NULL, 20), -- تمر كراميل
      ('0d266e0c-1c81-4ac2-ad59-9279d87c5153'::uuid, NULL, 21), -- توباكو
      ('4ce602a7-9b4b-493f-8049-a5b01bc39482'::uuid, NULL,  7), -- دولسورا
      ('0dd2feca-2477-4597-b243-f1595e9beb61'::uuid, NULL, 26), -- ديسمبر فانيلا
      ('8e2de698-3602-47b1-b8b7-061058c8e7da'::uuid, NULL, 26), -- رفقات ادورن
      ('cdee984c-8905-45af-9217-4f638ef03f46'::uuid, NULL,  6), -- ريتش ساندال
      ('4d23b558-8248-482f-b470-472687e74f89'::uuid, NULL,  8), -- عود ساتان
      ('d5cabe60-acdc-49ae-9b07-adc13d819a6d'::uuid, NULL, 25), -- فولاريس
      ('3aad8bd0-f590-4dc5-a771-ab14e296398f'::uuid, NULL,  1), -- فيغ هغ
      ('59966b0c-5f52-4c34-8229-2e907213c3f9'::uuid, NULL, 27), -- فيليستي
      ('514dd7d1-e50b-4902-9975-f0f114ba4adf'::uuid, NULL,  9), -- قصة ديليشس
      ('56c23fb9-313a-43f9-b518-eb6a574eb0a0'::uuid, NULL, 25), -- قصة غالا
      ('f73a7160-fc00-49ba-8bce-a04532e8164b'::uuid, NULL, 12), -- كراميل كاسكيد
      ('4cf04d6b-1c56-4a37-9c3b-0cd09de20294'::uuid, NULL, 16), -- كوكونت لاغون
      ('4251a528-f5ac-459d-ba24-7d33a6cfec28'::uuid, NULL, 20), -- كونفكشن
      ('e7daef11-bb45-499e-8c0e-01c29291a0b2'::uuid, NULL,  6), -- لاكتيا ديفينا
      ('e317c152-165e-4e8e-b4a2-70fdde79cf86'::uuid, NULL,  5), -- مارشميلو بلاش
      ('0b472c9b-6c23-4a5f-9c43-b96b74ccfff7'::uuid, NULL, 10), -- موسكو ميول
      ('a16ebfbb-dd82-4417-abcf-0d2da96415be'::uuid, NULL, 18), -- مولتن كراميل
      ('d236bd3f-c7cc-404e-8bf0-03d12e06903e'::uuid, NULL, 17), -- ميدنايت سن
      ('1d17c13b-f045-4b1c-8f56-72bcb623a0f1'::uuid, NULL,  9), -- مينيا
      ('e6370a6f-f826-42bb-8e81-a1a8065003a0'::uuid, NULL, 13), -- نيرفانا
      ('344738e4-9cbd-4e1e-9d50-4f656a4b43eb'::uuid, NULL, 24), -- واوي
      ('5e847790-11a5-439f-bace-c315e0ff1ae8'::uuid, NULL, 10), -- ويفر
      ('6feee2fb-3b43-4499-a988-fcbd648d56f5'::uuid,    0,  0), -- نورث ستاك 1
      ('e41ec722-dbb7-47b5-aa00-84f6f1c5a234'::uuid,    0,  0), -- نورث ستاك 2
      ('8167331f-b04a-4b6e-97e7-3d1eddf611dc'::uuid,    0,  0), -- نورث ستاك 4
      ('25be4be2-89c4-48f6-9a4b-108dd6917746'::uuid,    0,  0), -- فايبرنت
      ('fc20a9fa-3f26-46f2-898e-4ed72e9d2735'::uuid,    0,  0), -- ديلايت
      ('d6cb6a8c-8f61-47c3-8bb4-8e653a35e42c'::uuid,    0,  0), -- رفقات وايت
      ('c092ad91-c70e-4b0d-a22b-a445126ba783'::uuid, NULL,  0), -- فيوجن — out of stock; real count untouched
      ('eebd1ed9-cbf7-4296-9470-c52fa66e5252'::uuid,   36, 36)  -- بيرسيفيرون — 36 left
  ;

  SELECT count(*) INTO v_missing
  FROM _stock_plan s
  LEFT JOIN public.products p ON p.id = s.product_id AND p.tenant_id = v_tenant
  WHERE p.id IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% planned products are not scheniders-iraq products', v_missing;
  END IF;

  WITH changed AS (
    SELECT p.id, p.tenant_id, p.stock_quantity AS before, s.real_stock AS after
    FROM public.products p
    JOIN _stock_plan s ON s.product_id = p.id
    WHERE p.tenant_id = v_tenant
      AND s.real_stock IS NOT NULL
      AND p.stock_quantity IS DISTINCT FROM s.real_stock
  ), upd AS (
    UPDATE public.products p
    SET stock_quantity = c.after
    FROM changed c
    WHERE p.id = c.id
    RETURNING p.id
  ), hist AS (
    INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, notes, changed_by)
    SELECT c.id, c.tenant_id, 'count', c.after - coalesce(c.before, 0), c.before, c.after,
           'Stock count from the owner, 2026-11-01 (applied via SQL by Claude Code)', NULL
    FROM changed c
    RETURNING 1
  )
  INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
  SELECT c.tenant_id, c.id, NULL, NULL, 0, c.after - coalesce(c.before, 0), 0, 'manual:count'
  FROM changed c;

  UPDATE public.products p
  SET storefront_stock = s.shown
  FROM _stock_plan s
  WHERE p.id = s.product_id
    AND p.tenant_id = v_tenant
    AND p.storefront_stock IS DISTINCT FROM s.shown;

  DROP TABLE _stock_plan;
END $$;
