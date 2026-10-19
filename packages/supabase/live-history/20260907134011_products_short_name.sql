ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS short_name text;

COMMENT ON COLUMN public.products.short_name IS
    'Internal short name for employee-facing surfaces (orders, printing, labels, WhatsApp templates). Falls back to name when null. Customer-facing surfaces keep using name.';;
