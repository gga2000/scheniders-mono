import { createClient } from "@supabase/supabase-js";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase.from('products').select('*');
    if (error) {
        console.error(error);
        return;
    }
    const ids = data.map(p => p.id);
    const uniqueIds = new Set(ids);
    console.log(`Total Products: ${ids.length}, Unique IDs: ${uniqueIds.size}`);

    // Are there any products with no ID?
    const missingId = data.filter(p => !p.id);
    console.log(`Products missing ID: ${missingId.length}`);
}
main();
