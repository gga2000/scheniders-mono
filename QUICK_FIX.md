# ⚡ QUICK FIX - Orders Not Importing

## 🎯 For the Order You're Waiting For RIGHT NOW

### Option 1: Check & Process Queue (Fastest)
Open this in your browser:
```
https://yourdomain.com/api/cron/process-checkouts-manual
```

**What it does:** Processes any stuck checkouts immediately

---

### Option 2: Visual Dashboard (Recommended)
Open this in your browser:
```
https://yourdomain.com/debug
```

**What you'll see:**
- ✅ Overall system status
- 📊 Recent orders count
- 📦 Pending checkouts
- ⚠️ Issues and warnings
- 💡 Specific fix recommendations
- 🧪 One-click test webhook button
- ⚡ One-click process queue button

---

### Option 3: Manual Sync from Lightfunnels
If the order isn't in the queue, pull it directly from Lightfunnels API:

```bash
curl -X POST https://yourdomain.com/api/lightfunnels/sync \
  -H "Content-Type: application/json" \
  -d '{
    "action": "sync",
    "dateFrom": "2026-03-18",
    "dateTo": "2026-03-18"
  }'
```

Or open in browser:
```
https://yourdomain.com/api/lightfunnels/sync?action=sync
```

---

## 🔍 Diagnose the Root Cause

### Step 1: Check Status
```
https://yourdomain.com/api/debug/webhook-status
```

Look for:
- `"status": "ok"` vs `"error"`
- `"ordersLast24h": { "fromLightfunnels": 0 }` ← Problem!
- `"checkoutQueue": { "pending": 5 }` ← Orders stuck
- `"issues": [...]` ← Read these

### Step 2: Common Issues

#### Issue A: No webhooks arriving
**Check:**
- Is webhook configured in Lightfunnels?
- Is URL correct: `https://yourdomain.com/api/webhooks/lightfunnels`?
- Are events enabled: `order/created`, `checkout/created`?

**Fix:** Configure webhook in Lightfunnels dashboard

#### Issue B: Stuck in queue
**Check:** `checkoutQueue.pending > 0`

**Fix:** Click "Process Queue" button at `/debug`

#### Issue C: Missing API token
**Check:** `lightfunnelsToken.configured: false`

**Fix:** Go to Settings → Add Lightfunnels API token

#### Issue D: QStash not configured
**Check:** `environment.qstashToken: false`

**Fix:** Get keys from https://upstash.com/qstash

---

## 🛠️ Fix Webhook Integration (Permanent Fix)

### 1. Configure in Lightfunnels
1. Go to Lightfunnels Dashboard
2. Settings → Webhooks
3. Add webhook:
   - URL: `https://yourdomain.com/api/webhooks/lightfunnels`
   - Events: ✅ order/created ✅ checkout/created
   - Header: `x-webhook-secret` = your secret
4. Click "Send Test"

### 2. Set Environment Variables
```bash
# Required
LIGHTFUNNELS_WEBHOOK_SECRET=your_secret_here
QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_key
QSTASH_NEXT_SIGNING_KEY=your_key

# Recommended
WEBHOOK_LOGGING_ENABLED=true
```

### 3. Configure API Token
1. Go to your app → Settings
2. Enter Lightfunnels API token
3. Test connection
4. Save

---

## ✅ Verify It's Fixed

1. Open: `https://yourdomain.com/debug`
2. Click "Test Webhook" button
3. Should see: ✅ Test order created
4. Check orders page - test order should appear
5. Place real test order in Lightfunnels
6. Should appear within seconds

---

## 📞 Quick Reference

**Replace `yourdomain.com` with your actual domain:**

| What | URL |
|------|-----|
| Dashboard | https://yourdomain.com/debug |
| Status Check | https://yourdomain.com/api/debug/webhook-status |
| Process Queue | https://yourdomain.com/api/cron/process-checkouts-manual |
| Test Webhook | https://yourdomain.com/api/debug/test-webhook |
| Manual Sync | https://yourdomain.com/api/lightfunnels/sync |

**Lightfunnels webhook URL:**
```
https://yourdomain.com/api/webhooks/lightfunnels
```

---

## 🚨 Emergency: Get That Order NOW

If you need to import a specific order right now and can't wait:

1. Get the order ID from Lightfunnels
2. Use the manual sync with date filter
3. Or go to Settings → Lightfunnels → Sync Today's Orders

The order will appear immediately.
