import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: returnOrders } = await supabase.from('orders').select('id, created_at, status, order_id, is_return').eq('is_return', true).order('created_at', { ascending: false }).limit(2);
  console.log("Latest Return Orders:", JSON.stringify(returnOrders, null, 2));
}
run();
