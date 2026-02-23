import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: originalOrder } = await supabase.from('orders').select('*').eq('order_id', '1260220003').single();
  
  if (!originalOrder) {
      console.log("No order found for 1260220003");
      return;
  }
  
  const returnOrderData = {
      ...originalOrder,
      id: undefined, 
      created_at: undefined,
      updated_at: undefined,
      order_id: undefined,
      items: [{ name: "Test Return Item", price: 10000, quantity: 1, sku: "TEST" }],
      price: 10000,
      discount_amount: 0,
      status: 'rejected',
      is_return: true,
      original_order_id: originalOrder.id,
      rejection_reason: 'Partial Return',
      notes: (originalOrder.notes || "") + `\n[Partial Return] Items returned from original order.`,
      internal_notes: `Split from order ${originalOrder.order_id}`,
      last_batch_id: undefined,
      delivery_order_id: undefined,
      sequence_number: undefined,
      delivered_at: undefined,
      cancelled_at: undefined,
      printed_at: undefined,
      print_count: 0,
  };

  const returnOrderDataAny = returnOrderData;
  delete returnOrderDataAny.id;
  delete returnOrderDataAny.created_at;
  delete returnOrderDataAny.updated_at;

  const { data: newIdSeq, error: seqError } = await supabase.rpc('get_next_order_sequence');

  let order_id = null;
  if (!seqError && newIdSeq !== null) {
      const isBaghdad = originalOrder.governorate_code === 'BGD';
      let sequenceNum = typeof newIdSeq === 'number' ? newIdSeq : newIdSeq[0]?.next_val || newIdSeq.next_val;
      
      if (sequenceNum) {
          const datePart = new Date().toISOString().slice(2, 8).replace(/-/g, '');
          const seqString = String(sequenceNum).padStart(4, '0');
          const prefix = isBaghdad ? "1" : "2"; 
          order_id = `${prefix}${datePart}${seqString}`;
      }
  }

  const { data: insertedOrder, error: insertError } = await supabase
      .from('orders')
      .insert({ ...returnOrderDataAny, order_id })
      .select()
      .single();

  if (insertError) {
      console.error("FAILED TO INSERT RETURN ORDER:", insertError.message);
      console.error("Details:", insertError.details);
      console.error("Hint:", insertError.hint);
  } else {
      console.log("SUCCESS:", insertedOrder.id);
  }
}

run();
