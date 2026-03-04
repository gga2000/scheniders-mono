import { verifyAccessToken } from './lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    // Create regular client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // login as admin
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'admin@example.com', // wait, I don't know the admin email
        password: 'password123'
    });
    console.log("Logged in:", !!data.user);
    if (error) {
        console.log("Error logging in:", error.message);
        return;
    }
}
run();
