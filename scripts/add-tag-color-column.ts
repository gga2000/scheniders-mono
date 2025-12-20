import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function addTagColorColumn() {
    console.log('🔧 Adding tag_color column to products table...');

    // Try to add the column using RPC or direct query
    // Note: This may require admin/service role key
    const { error } = await supabase.rpc('exec_sql', {
        sql: "ALTER TABLE products ADD COLUMN IF NOT EXISTS tag_color TEXT DEFAULT '#22c55e'"
    });

    if (error) {
        console.log('⚠️ Could not add column via RPC (normal if no exec_sql function)');
        console.log('');
        console.log('📋 Please run this SQL in Supabase SQL Editor:');
        console.log('');
        console.log("   ALTER TABLE products ADD COLUMN IF NOT EXISTS tag_color TEXT DEFAULT '#22c55e';");
        console.log('');
    } else {
        console.log('✅ Column added successfully!');
    }
}

addTagColorColumn().catch(console.error);
