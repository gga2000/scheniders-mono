const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const query = `
    SELECT 
        jsonb_build_object('order_id', '1234', 'last_batch_id', '567') - 'order_id' as t1,
        jsonb_build_object('order_id', '1234', 'last_batch_id', '567') - array['order_id', 'last_batch_id'] as t2
    `;
  // JS string subtraction doesn't work that way, but Postgres jsonb - 'key' DOES work safely.
  // The issue in Postgres is that the `-` operator operates sequentially.
  
  // Let's verify our payload has `order_id` removed by `split_order_atomic` 
  // It looks like `split_order_atomic` line 181 is: 
  // `_return_order_data := to_jsonb(_original_order) || jsonb_build_object(...) - 'id' - 'created_at' - 'order_id' ...`
  // Actually, wait: `||` has LOWER precedence than `-` in Postgres.
  
  // So `A || B - 'order_id'` means `A || (B - 'order_id')`.
  // If `order_id` was in `A`, it is NOT removed!
  console.log("Ah ha! || has lower precedence than - in Postgres JSONB!");
}

run();
