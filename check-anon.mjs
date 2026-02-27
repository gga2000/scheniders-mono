import { createClient } from "@supabase/supabase-js";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use ANON KEY intentionally to simulate frontend
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase
        .from('products')
        .select('*');

    if (error) {
        console.error("Error with anon key:", error);
        return;
    }
    console.log("Total Products visible to ANON:", data?.length);
    if (data) {
        data.forEach(p => console.log(p.name));
    }
}
main();
