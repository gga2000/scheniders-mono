-- Two foreign keys linked customer_tag_assignments to customer_tags, which made
-- PostgREST embeds ambiguous (HTTP 300) and broke the customer page (#909).
-- The composite (tenant_id, tag_id) key also enforces same-store tags; both
-- columns are NOT NULL, so it covers everything the single-column key did.
ALTER TABLE public.customer_tag_assignments
    DROP CONSTRAINT IF EXISTS customer_tag_assignments_tag_id_fkey;