import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkNotifications() {
    console.log('--- Checking order_notifications table ---');

    // 1. Check if table exists and column is_read exists
    const { data: cols, error: colError } = await supabase
        .from('order_notifications')
        .select('*')
        .limit(1);

    if (colError) {
        console.error('Error fetching notifications:', colError.message);
        return;
    }

    if (cols && cols.length > 0) {
        const hasIsRead = 'is_read' in cols[0];
        console.log(`Table exists. has 'is_read' column: ${hasIsRead}`);
        console.log('Sample record:', JSON.stringify(cols[0], null, 2));
    } else {
        console.log('Table exists but is empty.');
    }

    // 2. Try to update a notification
    const { data: unread, error: unreadError } = await supabase
        .from('order_notifications')
        .select('id, is_read')
        .eq('is_read', false)
        .limit(1);

    if (unreadError) {
        console.error('Error fetching unread:', unreadError.message);
    } else if (unread && unread.length > 0) {
        const id = unread[0].id;
        console.log(`Attempting to mark notification ${id} as read...`);

        const { error: updateError } = await supabase
            .from('order_notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (updateError) {
            console.error('Update failed:', updateError.message);
        } else {
            console.log('Update reported success (no error).');

            // Verify update
            const { data: verified, error: verifyError } = await supabase
                .from('order_notifications')
                .select('is_read')
                .eq('id', id)
                .single();

            if (verifyError) {
                console.error('Verification query failed:', verifyError.message);
            } else {
                console.log(`After update, is_read is: ${verified.is_read}`);
                if (verified.is_read) {
                    console.log('SUCCESS: Read status persisted.');
                } else {
                    console.log('FAILURE: Read status reverted or stayed false.');
                }
            }
        }
    } else {
        console.log('No unread notifications to test with.');
    }
}

checkNotifications();
