-- =============================================
-- EXPENSES TABLE SCHEMA
-- For Scheniders Perfume Order Management
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- EXPENSE CATEGORIES ENUM
-- =============================================
DO $$ BEGIN
    CREATE TYPE expense_category AS ENUM (
        'product_cost',
        'packaging',
        'sample_vial',
        'sample_perfume',
        'thank_you_cards',
        'sweets',
        'marketing',
        'shipping',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- EXPENSES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS expenses (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Expense date (when the expense occurred, not when recorded)
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Category
    category expense_category NOT NULL,
    
    -- Description
    description TEXT,
    
    -- Amount in IQD
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    
    -- Optional: link to order if expense is order-specific
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Notes
    notes TEXT,
    
    -- For recurring expenses tracking
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_period TEXT -- 'daily', 'weekly', 'monthly'
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);

-- =============================================
-- UPDATED_AT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_expenses_updated_at();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations on expenses" ON expenses;

-- Allow ALL users (anon + authenticated) to perform all operations
CREATE POLICY "Allow all operations on expenses"
    ON expenses FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE expenses IS 'Tracks business expenses by category for profit calculations';
COMMENT ON COLUMN expenses.category IS 'Expense type: product_cost, packaging, sample_vial, sample_perfume, thank_you_cards, sweets, marketing, shipping, other';
COMMENT ON COLUMN expenses.expense_date IS 'Date the expense occurred (for reporting purposes)';
COMMENT ON COLUMN expenses.is_recurring IS 'Whether this is a recurring expense that repeats';

-- =============================================
-- HELPER VIEW: Monthly Expense Summary
-- =============================================
CREATE OR REPLACE VIEW monthly_expense_summary AS
SELECT 
    DATE_TRUNC('month', expense_date) as month,
    category,
    SUM(amount) as total_amount,
    COUNT(*) as expense_count
FROM expenses
GROUP BY DATE_TRUNC('month', expense_date), category
ORDER BY month DESC, category;

-- =============================================
-- HELPER VIEW: Daily Totals
-- =============================================
CREATE OR REPLACE VIEW daily_expense_totals AS
SELECT 
    expense_date,
    SUM(amount) as total_amount,
    COUNT(*) as expense_count,
    jsonb_object_agg(category, category_amount) as by_category
FROM (
    SELECT 
        expense_date,
        category,
        SUM(amount) as category_amount,
        SUM(amount) as amount
    FROM expenses
    GROUP BY expense_date, category
) subq
GROUP BY expense_date
ORDER BY expense_date DESC;
