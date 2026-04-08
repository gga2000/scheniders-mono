#!/usr/bin/env npx ts-node

/**
 * Fix Sequence Numbers Script
 * 
 * This script reassigns all order sequence numbers based on creation date.
 * Run with: npx ts-node scripts/fix-sequence-numbers.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSequenceNumbers() {
    console.log('🔧 Starting sequence number fix...\n');

    // 1. Fetch all orders sorted by created_at
    console.log('📥 Fetching all orders...');
    const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_id, sequence_number, created_at')
        .order('created_at', { ascending: true });

    if (fetchError) {
        console.error('❌ Error fetching orders:', fetchError);
        process.exit(1);
    }

    console.log(`✅ Found ${orders.length} orders\n`);

    // 2. Update each order with its correct sequence number
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const newSequenceNumber = i + 1; // 1-based indexing

        // Only update if different
        if (order.sequence_number !== newSequenceNumber) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ sequence_number: newSequenceNumber })
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Error updating order ${order.order_id}:`, updateError);
                errors++;
            } else {
                updated++;
                // Progress indicator every 50 orders
                if (updated % 50 === 0) {
                    console.log(`   Updated ${updated}/${orders.length}...`);
                }
            }
        }
    }

    console.log(`\n✅ Done! Updated ${updated} orders, ${errors} errors`);
    console.log(`📊 Sequence numbers now range from 1 to ${orders.length}`);
}

fixSequenceNumbers().catch(console.error);
