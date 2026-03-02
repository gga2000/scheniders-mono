const fs = require('fs');

const envPath = '/Users/ali/Scheniders/.env.local';
const envFile = fs.readFileSync(envPath, 'utf8');
const urlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=([^\n]+)/);
const keyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\n]+)/);

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

async function run() {
    const ids = JSON.parse(fs.readFileSync('/tmp/missing_confirmed_orders.json', 'utf8'));

    // Checking how many of these exist in the DB
    // We have to chunk them if the URL gets too long, but for 120 it might be okay. Let's do a POST query.
    // Wait, Supabase rest API allows eq.in, maybe it's cleaner to query /rest/v1/orders

    const res = await fetch(`${url}/rest/v1/orders?select=id,status&id=in.(${ids.join(',')})`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });

    const data = await res.json();

    const currentStatuses = {};
    for (const d of data) {
        currentStatuses[d.status] = (currentStatuses[d.status] || 0) + 1;
    }

    console.log(`Out of ${ids.length} orders in backup, found ${data.length} in DB.`);
    console.log('Their current statuses in DB:', currentStatuses);
}

run();
