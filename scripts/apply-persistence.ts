import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables (URL or Service Role Key)');
    process.exit(1);
}

// Service role client has bypass RLS permissions
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
    console.log('--- Applying Persistent Notifications Read Status Migration ---');

    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260309100000_persist_notification_read_status.sql');
    if (!fs.existsSync(migrationPath)) {
        console.error('Migration file not found at:', migrationPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Supabase JS doesn't have a direct 'sql' execution method exposed in the client 
    // unless using the Remote Procedure Call (rpc) with a custom function.
    // However, we can try to use a trick: Postgres allows executing multiple statements if the driver supports it.
    // But since this is a migration, we really need the SQL execution.

    console.log('Attempting to apply migration via RPC (if exec_sql exists)...');

    // If we don't have an exec_sql function, we might be stuck without DATABASE_URL.
    // Let's check if we can at least add the column via a simpler method if RPC fails.

    const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (rpcError) {
        console.error('RPC exec_sql failed:', rpcError.message);
        console.log('Trying manual column addition via a table update (this won\'t work for full SQL but might for simple DDL if permitted)...');

        // Final fallback: try to use the CLI if available
        console.log('Suggesting fallback: run "npx supabase db push" or provide DATABASE_URL.');
    } else {
        console.log('Migration applied successfully via RPC.');
    }
}

applyMigration();
