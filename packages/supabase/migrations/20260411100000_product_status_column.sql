-- Add product status column for workflow support
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add constraint
ALTER TABLE public.products
    ADD CONSTRAINT products_status_check CHECK (status IN ('draft', 'active', 'archived'));

-- Migrate existing data
UPDATE public.products SET status = 'archived' WHERE is_archived = true;
UPDATE public.products SET status = 'active' WHERE is_archived = false;

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
