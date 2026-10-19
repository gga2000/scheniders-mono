-- Add missing foreign keys so PostgREST embeds (product:products, order:orders) resolve.
ALTER TABLE public.qc_quarantine
    ADD CONSTRAINT qc_quarantine_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.qc_quarantine
    ADD CONSTRAINT qc_quarantine_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- Nudge PostgREST schema cache to see new relationships
NOTIFY pgrst, 'reload schema';
;
