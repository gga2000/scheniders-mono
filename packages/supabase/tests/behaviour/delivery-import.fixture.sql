-- Throwaway Postgres 16 database shaped like the live objects
-- rollback_delivery_import touches. Columns copied from the live project
-- (information_schema, 2026-11-14); tables carry only what the function reads.
-- NEVER run this against Supabase.

CREATE TABLE public.delivery_imports (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    status text NOT NULL
);

CREATE TABLE public.delivery_import_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    import_id uuid NOT NULL REFERENCES public.delivery_imports (id) ON DELETE CASCADE,
    order_id uuid,
    pdf_row_number integer NOT NULL,
    action text NOT NULL,
    previous_status text,
    new_status text,
    previous_values jsonb
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    status text NOT NULL,
    price numeric,
    delivered_at timestamptz,
    needs_attention boolean DEFAULT false,
    attention_reasons text[],
    delivery_note text
);
