const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const originalOrderId = '03305839-6242-436f-9116-027823e6edea';
  
  const { data: originalOrder, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', originalOrderId)
    .single();
    
  if (fetchError) {
    console.error('Fetch error:', fetchError);
    return;
  }
  
  // recreate `split_order_atomic` JSON manipulation in node to test if order_id is removed correctly
  const returnOrderData = {
      ...originalOrder,
      items: [],
      price: 0,
      discount_amount: 0,
      status: 'rejected',
      is_return: true,
      original_order_id: originalOrder.id,
      rejection_reason: 'Partial Return'
  };
  
  // Try Postgres jsonb minus simulation:
  delete returnOrderData.id;
  delete returnOrderData.created_at;
  delete returnOrderData.updated_at;
  delete returnOrderData.order_id;
  delete returnOrderData.last_batch_id;
  delete returnOrderData.delivery_order_id;
  delete returnOrderData.sequence_number;
  delete returnOrderData.delivered_at;
  delete returnOrderData.cancelled_at;
  delete returnOrderData.printed_at;
  delete returnOrderData.print_count;

  console.log('Return Order Data without order_id:', returnOrderData.order_id);
  
  // Okay, if it's properly deleted in JS, why did SQL fail?
  // Let's actually execute the jsonb calculation on Postgres:
  const { data: sqlData, error: sqlError } = await supabase.rpc('test_jsonb', {
      _data: originalOrder
  });
  
  // wait we don't have test_jsonb RPC. We'll just look at what `create_order_atomic` does.
}

run();
