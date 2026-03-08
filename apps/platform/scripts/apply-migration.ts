import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        console.log('Checking if order_notifications exists...');
        const checkRes = await client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'order_notifications')");
        const exists = checkRes.rows[0].exists;
        console.log('Exists:', exists);

        if (!exists) {
            console.log('Applying migration...');
            const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260308100000_persistent_notifications.sql'), 'utf8');
            await client.query(sql);
            console.log('Migration applied successfully.');
        } else {
            console.log('Table already exists. Checking for recent notifications...');
            const countRes = await client.query("SELECT count(*) FROM order_notifications");
            console.log('Count:', countRes.rows[0].count);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

main();
