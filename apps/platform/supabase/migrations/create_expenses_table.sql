-- Create expenses table for tracking business expenses
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expense_date DATE NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'product_cost',
        'packaging',
        'sample_vial',
        'sample_perfume',
        'thank_you_cards',
        'sweets',
        'marketing',
        'shipping',
        'other'
    )),
    description TEXT,
    amount NUMERIC NOT NULL DEFAULT 0,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    notes TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_period TEXT CHECK (recurring_period IN ('daily', 'weekly', 'monthly', 'yearly'))
);

-- Create index for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- Enable Row Level Security (RLS)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
-- Adjust this based on your security requirements
CREATE POLICY "Allow all operations for authenticated users"
ON public.expenses
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also allow anon users if you're not using authentication
CREATE POLICY "Allow all operations for anon users"
ON public.expenses
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.expenses TO anon;
GRANT ALL ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
