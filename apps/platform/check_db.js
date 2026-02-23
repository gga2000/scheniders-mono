const { createClient } = require('@supabase/supabase-js');
// Need to load env
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('orders').select('id, items, order_id, original_order_id, is_return').ilike('order_id', '%1260220003%').limit(5);
  console.log(JSON.stringify(data, null, 2));
}
check();
