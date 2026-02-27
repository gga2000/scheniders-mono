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
    console.log("Total Products:", data.length);
    console.log("Non-supply products:", data.filter(p => !p.is_supply).length);
    console.log("Active (non-archived) non-supply:", data.filter(p => !p.is_supply && !p.is_archived).length);

    // Log the properties of the products that are not showing
    const active = data.filter(p => !p.is_archived);
    active.forEach(p => {
        console.log(`Product: ${p.name}, is_supply: ${p.is_supply}, is_archived: ${p.is_archived}`);
    });
}
main();
