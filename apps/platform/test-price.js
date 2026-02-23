const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('orders').select('order_id, price, original_order_id, is_return').eq('order_id', '1260220003').single();
  console.log("Current state of 1260220003:", data);
}
run();
