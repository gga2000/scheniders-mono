# Lightfunnels Order Import Troubleshooting Guide

## 🚀 Quick Start - Visual Dashboard

**Go to:** `https://yourdomain.com/debug`

This dashboard shows you:
- ✅ System status at a glance
- 📊 Recent order statistics
- 📦 Pending checkouts
- ⚠️ Issues and warnings
- 💡 One-click fixes
- 🧪 Test webhook button
- ⚡ Process queue button

**For immediate action, read:** [QUICK_FIX.md](QUICK_FIX.md)

---

## 🔍 Understanding How Orders Are Imported

Your app imports orders from Lightfunnels using **two different methods**:

### Method 1: Completed Orders (Immediate Import)
When a customer **completes** a purchase on Lightfunnels:
1. Lightfunnels sends `order/created` webhook → `/api/webhooks/lightfunnels`
2. Order is created **immediately** in your database
3. WhatsApp confirmation is triggered

### Method 2: Abandoned Checkouts (Delayed Import)
When a customer **starts but doesn't complete** checkout:
1. Lightfunnels sends `checkout/created` webhook → `/api/webhooks/lightfunnels`
2. Checkout is **queued** in `checkout_queue` table (2-minute delay)
3. QStash schedules a delayed callback
4. After 2 minutes, `/api/cron/process-checkouts` runs
5. Full checkout data is fetched from Lightfunnels API
6. Order is created with status `pending_checkout`

---

## 🚨 Common Issues & Solutions

### Issue 1: Order Not Showing Up

**Possible Causes:**

#### A. Webhook Never Received
**Check:**
- Is the webhook URL configured correctly in Lightfunnels?
  - URL: `https://yourdomain.com/api/webhooks/lightfunnels`
  - Events: `order/created`, `checkout/created`
- Is your app deployed and accessible?
- Check server logs for incoming webhook requests

**Solution:**
1. Go to Lightfunnels dashboard → Settings → Webhooks
2. Verify the webhook URL matches your production URL
3. Click "Send Test" to test the connection
4. Check logs: `vercel logs` or your hosting platform's logs

#### B. Webhook Secret Mismatch
**Check:**
- `LIGHTFUNNELS_WEBHOOK_SECRET` in environment variables
- Secret configured in Lightfunnels matches your env var

**Solution:**
```bash
# In production (Vercel)
vercel env add LIGHTFUNNELS_WEBHOOK_SECRET

# Use the same secret in Lightfunnels webhook settings
```

#### C. Stuck in Checkout Queue
If it's an abandoned checkout, it might be stuck in the queue.

**Check manually:**
1. Open your browser to: `https://yourdomain.com/api/cron/process-checkouts-manual`
2. This will process ALL pending checkouts immediately

**Check database:**
```sql
SELECT * FROM checkout_queue WHERE processed_at IS NULL;
```

#### D. QStash Not Configured
Abandoned checkouts require QStash for delayed processing.

**Check:**
- `QSTASH_TOKEN` environment variable
- `QSTASH_CURRENT_SIGNING_KEY` environment variable
- `QSTASH_NEXT_SIGNING_KEY` environment variable

**Solution:**
1. Sign up at https://upstash.com/qstash
2. Get your token and signing keys
3. Add to environment variables:
```bash
vercel env add QSTASH_TOKEN
vercel env add QSTASH_CURRENT_SIGNING_KEY
vercel env add QSTASH_NEXT_SIGNING_KEY
```

#### E. Missing Lightfunnels API Token
For checkouts, the system needs to fetch full data from the API.

**Check:**
1. Go to your app → Settings → Lightfunnels Integration
2. Verify access token is configured
3. Test connection

**Solution:**
```bash
# Via settings page
1. Go to Settings
2. Enter Lightfunnels access token
3. Click "Test Connection"
4. Click "Save"
```

---

## 🛠️ Quick Fixes

### Fix 1: Manual Checkout Processing
If orders are stuck in the queue, process them manually:

**Option A: Via Browser**
```
Open: https://yourdomain.com/api/cron/process-checkouts-manual
```

**Option B: Via API**
```bash
curl https://yourdomain.com/api/cron/process-checkouts-manual
```

### Fix 2: Manual Sync Recent Orders
Pull recent orders directly from Lightfunnels API:

**Via Browser/Postman:**
```bash
POST https://yourdomain.com/api/lightfunnels/sync
Content-Type: application/json

{
  "action": "sync",
  "dateFrom": "2026-03-18",
  "dateTo": "2026-03-18"
}
```

This will:
- Fetch all orders from today
- Import missing orders
- Skip duplicates

### Fix 3: Check Webhook Logs
If `WEBHOOK_LOGGING_ENABLED=true`, check your logs:

```bash
# Vercel
vercel logs --follow

# Look for:
# [Webhook] Raw payload keys: ...
# [Webhook] Checkout queued for import...
# [Cron] Processing checkout...
```

---

## 📋 Step-by-Step Debugging Process

### Step 1: Verify Environment Variables

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` ✅
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅

**Recommended for Webhooks:**
- `LIGHTFUNNELS_WEBHOOK_SECRET` (for security)
- `WEBHOOK_LOGGING_ENABLED=true` (for debugging)

**Required for Checkouts:**
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

**Required for API Sync:**
- Lightfunnels access token (stored in database via Settings page)

### Step 2: Check Webhook Configuration

1. **Lightfunnels Dashboard:**
   - Go to Settings → Webhooks
   - Verify URL: `https://yourdomain.com/api/webhooks/lightfunnels`
   - Events enabled: `order/created`, `checkout/created`
   - Status: Active

2. **Test Endpoint:**
   ```bash
   curl https://yourdomain.com/api/webhooks/lightfunnels
   # Should return: {"message":"LightFunnels Webhook Endpoint","method":"POST only","status":"active"}
   ```

### Step 3: Check Database Tables

**Orders table:**
```sql
-- Check recent orders from Lightfunnels
SELECT order_id, customer_name, status, created_at
FROM orders
WHERE source = 'lightfunnels'
ORDER BY created_at DESC
LIMIT 10;
```

**Checkout queue:**
```sql
-- Check pending checkouts
SELECT checkout_id, queued_at, process_after, attempts, last_error
FROM checkout_queue
WHERE processed_at IS NULL;
```

### Step 4: Manual Processing

If you find stuck checkouts:
```
Open: https://yourdomain.com/api/cron/process-checkouts-manual
```

If you need to sync recent orders:
```bash
curl -X POST https://yourdomain.com/api/lightfunnels/sync \
  -H "Content-Type: application/json" \
  -d '{"action":"sync","dateFrom":"2026-03-18"}'
```

---

## 🎯 For Your Current Issue

Since someone just placed an order and it didn't show up, here's what to do **right now**:

### Immediate Actions:

1. **Check if it's in the queue:**
   ```
   Open: https://yourdomain.com/api/cron/process-checkouts-manual
   ```
   This will show you if there are pending checkouts and process them.

2. **Sync recent orders:**
   ```bash
   curl -X POST https://yourdomain.com/api/lightfunnels/sync \
     -H "Content-Type: application/json" \
     -d '{"action":"sync","dateFrom":"2026-03-18"}'
   ```

3. **Check webhook logs:**
   ```bash
   vercel logs --follow
   ```
   Look for webhook attempts in the last hour.

### Root Cause Analysis:

**If order was received but stuck:**
- → Process manually via `/process-checkouts-manual`
- → Configure QStash for automatic processing

**If webhook never arrived:**
- → Check Lightfunnels webhook configuration
- → Verify webhook URL is correct
- → Test with "Send Test Webhook" in Lightfunnels

**If webhook was rejected:**
- → Check `LIGHTFUNNELS_WEBHOOK_SECRET` matches
- → Check logs for 401 errors

---

## 🔧 Production Checklist

Ensure all these are configured:

- [ ] Lightfunnels webhook URL configured
- [ ] Webhook events enabled (order/created, checkout/created)
- [ ] `LIGHTFUNNELS_WEBHOOK_SECRET` set (optional but recommended)
- [ ] `QSTASH_TOKEN` set (required for checkout processing)
- [ ] `QSTASH_CURRENT_SIGNING_KEY` set
- [ ] `QSTASH_NEXT_SIGNING_KEY` set
- [ ] Lightfunnels API token saved (Settings page)
- [ ] `WEBHOOK_LOGGING_ENABLED=true` (for debugging)
- [ ] Test order placed and appears in dashboard

---

## 📞 Still Having Issues?

1. Run the diagnostic script:
   ```bash
   npx ts-node scripts/diagnose-webhook.ts
   ```

2. Check the results and look for ❌ marks

3. Follow the recommendations provided

4. If the issue persists, check:
   - Supabase RLS policies (orders table must allow service role inserts)
   - Database permissions
   - Vercel deployment logs
   - Lightfunnels webhook delivery logs
