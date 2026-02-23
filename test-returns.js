const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: parent } = await supabase.from('orders').select('id, order_id').eq('order_id', '1260220003').single();
  console.log("Parent:", parent);
  if (parent) {
    const { data: children } = await supabase.from('orders').select('id, order_id, status, is_return').eq('original_order_id', parent.id);
    console.log("Children:", children);
  }
}
run();
