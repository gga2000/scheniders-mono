#!/usr/bin/env node

/**
 * Database Backup Script
 * 
 * Exports all Supabase tables to JSON files for backup purposes.
 * Can be run manually or scheduled via cron/GitHub Actions.
 * 
 * Usage:
 *   node scripts/backup-database.js
 *   
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY for limited backup)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TABLES_TO_BACKUP = [
    'orders',
    'products',
    'blacklist',
    'message_templates',
    'filter_presets',
    'rejection_reasons',
    'order_status_history',
    'order_notes',
    'user_profiles',
    'activity_log',
];

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Fetch data from Supabase table
 */
async function fetchTable(tableName) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${tableName}`);
        url.searchParams.set('select', '*');
        url.searchParams.set('limit', '10000'); // Adjust as needed

        const options = {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
            },
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (err) {
                    reject(new Error(`Failed to parse response for ${tableName}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Create backup for a single table
 */
async function backupTable(tableName, timestamp) {
    console.log(`  Backing up ${tableName}...`);

    try {
        const data = await fetchTable(tableName);
        const filename = `${tableName}_${timestamp}.json`;
        const filepath = path.join(BACKUP_DIR, filename);

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`    ✓ ${tableName}: ${Array.isArray(data) ? data.length : 0} records`);

        return { table: tableName, count: Array.isArray(data) ? data.length : 0, success: true };
    } catch (err) {
        console.error(`    ✗ ${tableName}: ${err.message}`);
        return { table: tableName, error: err.message, success: false };
    }
}

/**
 * Create manifest file with backup metadata
 */
function createManifest(results, timestamp) {
    const manifest = {
        timestamp,
        created_at: new Date().toISOString(),
        tables: results,
        total_tables: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        total_records: results.reduce((sum, r) => sum + (r.count || 0), 0),
    };

    const filepath = path.join(BACKUP_DIR, `manifest_${timestamp}.json`);
    fs.writeFileSync(filepath, JSON.stringify(manifest, null, 2));

    return manifest;
}

/**
 * Clean up old backups (keep last N days)
 */
function cleanupOldBackups(daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const files = fs.readdirSync(BACKUP_DIR);
    let deletedCount = 0;

    files.forEach(file => {
        const filepath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filepath);

        if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filepath);
            deletedCount++;
        }
    });

    if (deletedCount > 0) {
        console.log(`\n🧹 Cleaned up ${deletedCount} old backup files`);
    }
}

/**
 * Main backup function
 */
async function main() {
    console.log('═══════════════════════════════════════');
    console.log('  Schenider OMS Database Backup');
    console.log('═══════════════════════════════════════\n');

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('❌ Error: Missing Supabase credentials');
        console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    console.log(`📅 Timestamp: ${timestamp}`);
    console.log(`📁 Backup directory: ${BACKUP_DIR}\n`);

    console.log('Starting backup...\n');

    const results = [];
    for (const table of TABLES_TO_BACKUP) {
        const result = await backupTable(table, timestamp);
        results.push(result);
    }

    // Create manifest
    const manifest = createManifest(results, timestamp);

    // Summary
    console.log('\n' + '─'.repeat(40));
    console.log('📊 Backup Summary:');
    console.log(`   Total tables: ${manifest.total_tables}`);
    console.log(`   Successful: ${manifest.successful}`);
    console.log(`   Failed: ${manifest.failed}`);
    console.log(`   Total records: ${manifest.total_records}`);
    console.log('─'.repeat(40) + '\n');

    // Cleanup old backups
    cleanupOldBackups(7);

    if (manifest.failed > 0) {
        console.log('⚠️  Backup completed with errors');
        process.exit(1);
    } else {
        console.log('✅ Backup completed successfully!');
    }
}

// Run backup
main().catch(err => {
    console.error('❌ Backup failed:', err);
    process.exit(1);
});
