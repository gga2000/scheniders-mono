CREATE TABLE public.order_reasons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('cancel', 'reject')),
  label_ar      text NOT NULL,
  label_en      text,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  is_system     boolean NOT NULL DEFAULT false,
  requires_note boolean NOT NULL DEFAULT false,
  color         text,
  emoji         text,
  aliases       text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_reasons_tenant_kind_sort
  ON public.order_reasons (tenant_id, kind, sort_order);

CREATE INDEX idx_order_reasons_tenant_active
  ON public.order_reasons (tenant_id, is_active);

CREATE OR REPLACE FUNCTION public.tg_order_reasons_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_reasons_updated_at
  BEFORE UPDATE ON public.order_reasons
  FOR EACH ROW EXECUTE FUNCTION public.tg_order_reasons_updated_at();

ALTER TABLE public.order_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_reasons_select ON public.order_reasons
  FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY order_reasons_write ON public.order_reasons
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'super_admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'super_admin')
    )
  );

INSERT INTO public.order_reasons (
  id, tenant_id, kind, label_ar, label_en, sort_order, is_active,
  is_system, requires_note, color, emoji, aliases, created_at, updated_at
)
SELECT
  rr.id,
  rr.tenant_id,
  'reject' AS kind,
  COALESCE(rr.label_ar, rr.label) AS label_ar,
  rr.label AS label_en,
  COALESCE(rr.sort_order, 0) AS sort_order,
  COALESCE(rr.is_active, true) AS is_active,
  false AS is_system,
  false AS requires_note,
  NULL::text AS color,
  NULL::text AS emoji,
  '{}'::text[] AS aliases,
  COALESCE(rr.created_at, now()) AS created_at,
  now() AS updated_at
FROM public.rejection_reasons rr
WHERE rr.tenant_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.order_reasons
      WHERE tenant_id = t.id AND kind = 'cancel'
    ) THEN
      INSERT INTO public.order_reasons
        (tenant_id, kind, label_ar, label_en, sort_order, is_active, is_system, requires_note, color, emoji)
      VALUES
        (t.id, 'cancel', 'لم يرد العميل',          'Customer did not reply',   0, true, false, false, 'amber',   '🔕'),
        (t.id, 'cancel', 'ألغى العميل',            'Customer cancelled',       1, true, false, false, 'rose',    '🚫'),
        (t.id, 'cancel', 'خارج منطقة التوصيل',     'Outside delivery area',    2, true, false, false, 'sky',     '🗺️'),
        (t.id, 'cancel', 'منتج غير متوفر',         'Product unavailable',      3, true, false, false, 'orange',  '📦'),
        (t.id, 'cancel', 'سعر غير مناسب',          'Price issue',              4, true, false, false, 'pink',    '💸'),
        (t.id, 'cancel', 'طلب مكرر',               'Duplicate order',          5, true, false, false, 'emerald', '🔁'),
        (t.id, 'cancel', 'معلومات خاطئة',          'Wrong information',        6, true, false, false, 'violet',  '⚠️'),
        (t.id, 'cancel', 'سبب آخر',                'Other reason',             7, true, true,  true,  'slate',   '✏️');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.order_reasons
      WHERE tenant_id = t.id AND kind = 'reject'
    ) THEN
      INSERT INTO public.order_reasons
        (tenant_id, kind, label_ar, label_en, sort_order, is_active, is_system, requires_note, color, emoji)
      VALUES
        (t.id, 'reject', 'لا يجاوب',                'No answer',                0, true, false, false, 'amber',   '📵'),
        (t.id, 'reject', 'عنوان خاطئ',              'Wrong address',            1, true, false, false, 'orange',  '📍'),
        (t.id, 'reject', 'رفض العميل',              'Customer refused',         2, true, false, false, 'rose',    '🚫'),
        (t.id, 'reject', 'لم يوافق على السعر',     'Price disagreement',       3, true, false, false, 'pink',    '💸'),
        (t.id, 'reject', 'طلب التأجيل',             'Customer postponed',       4, true, false, false, 'sky',     '⏰'),
        (t.id, 'reject', 'غير متواجد',              'Not available',            5, true, false, false, 'slate',   '🏠'),
        (t.id, 'reject', 'الهاتف مغلق',             'Phone off',                6, true, false, false, 'violet',  '🔌'),
        (t.id, 'reject', 'منتج خاطئ',               'Wrong product',            7, true, false, false, 'emerald', '🎁'),
        (t.id, 'reject', 'سبب آخر',                 'Other reason',             8, true, true,  true,  'slate',   '✏️');
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reason_id uuid
  REFERENCES public.order_reasons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_reason_id ON public.orders (reason_id);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rejection_reason_id_fkey;
ALTER TABLE public.orders DROP COLUMN IF EXISTS rejection_reason_id;

DROP TABLE IF EXISTS public.rejection_reasons;;
