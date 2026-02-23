import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: originalOrder } = await supabase.from('orders').select('*').eq('id', 'e5c43097-187f-4c1b-93a7-e2d6f3ad0e93').single();
  
  const returnOrderData = {
      ...originalOrder,
      id: undefined,
      created_at: undefined,
      order_id: String(Math.floor(Math.random() * 1000000000)), // dummy order_id
      items: [{ name: 'Test', price: 10000, quantity: 1, sku: 'TEST' }],
      status: 'rejected',
      is_return: true,
      original_order_id: originalOrder.id,
      rejection_reason: 'Partial Return'
  };

  delete returnOrderData.id;
  delete returnOrderData.created_at;
  delete returnOrderData.updated_at;

  const { data, error } = await supabase.from('orders').insert(returnOrderData).select();
  
  if (error) {
      console.error("Simple insert failed:", error);
  } else {
      console.log("Success! ID:", data[0].id);
  }
}
run();
