# 🔍 Webhook Diagnostics - Quick Guide

## Issue: Orders Not Importing from Lightfunnels

If orders placed on Lightfunnels aren't showing up in your app, use these diagnostic tools to identify and fix the issue.

---

## 🚀 Quick Diagnostic Tools

### 1. **Comprehensive Status Check**
```
https://yourdomain.com/api/debug/webhook-status
```

**What it shows:**
- ✅ Environment variable status
- ✅ Lightfunnels API token status
- ✅ Recent orders (last 24h)
- ✅ Pending checkouts in queue
- ✅ Webhook endpoint accessibility
- ✅ Specific issues and recommendations

**When to use:** First thing to check when orders aren't importing

---

### 2. **Test Webhook Delivery**
```
https://yourdomain.com/api/debug/test-webhook
```

**What it does:**
- Sends a test order payload to your webhook endpoint
- Verifies webhook handler is working correctly
- Creates a test order in your database

**When to use:** To verify your webhook handler code is working

**Expected result:** You should see a test order appear in your orders list

---

### 3. **Process Pending Checkouts**
```
https://yourdomain.com/api/cron/process-checkouts-manual
```

**What it does:**
- Shows all checkouts stuck in the queue
- Processes them immediately
- Reports success/failure for each

**When to use:** When checkouts are stuck waiting to be processed

---

## 📋 Step-by-Step Troubleshooting

### Step 1: Check Overall Status
1. Open: `https://yourdomain.com/api/debug/webhook-status`
2. Look for the `status` field:
   - `"ok"` - Everything is fine
   - `"warning"` - Minor issues, but functional
   - `"error"` - Critical issues preventing imports

3. Read the `issues` and `recommendations` sections

### Step 2: Identify the Problem

#### Problem A: No Orders in Last 24 Hours
**Symptoms:**
```json
{
  "ordersLast24h": {
    "fromLightfunnels": 0
  }
}
```

**Likely causes:**
1. Webhook not configured in Lightfunnels
2. Webhook URL is wrong
3. Webhooks are being rejected (wrong secret)

**Fix:**
1. Go to Lightfunnels Dashboard → Settings → Webhooks
2. Add webhook:
   - URL: `https://yourdomain.com/api/webhooks/lightfunnels`
   - Events: `order/created`, `checkout/created`
   - Header: `x-webhook-secret: your_secret_here`
3. Click "Send Test" to verify

#### Problem B: Pending Checkouts in Queue
**Symptoms:**
```json
{
  "checkoutQueue": {
    "pending": 5
  }
}
```

**Likely causes:**
1. QStash not configured (missing env vars)
2. Lightfunnels API token missing
3. Checkout processing failing

**Fix:**
1. Visit: `https://yourdomain.com/api/cron/process-checkouts-manual`
2. This will process them immediately and show any errors
3. Configure QStash if needed:
   ```bash
   # Get from https://upstash.com/qstash
   QSTASH_TOKEN=...
   QSTASH_CURRENT_SIGNING_KEY=...
   QSTASH_NEXT_SIGNING_KEY=...
   ```

#### Problem C: Lightfunnels API Token Not Configured
**Symptoms:**
```json
{
  "lightfunnelsToken": {
    "configured": false
  }
}
```

**Fix:**
1. Go to your app → Settings
2. Enter Lightfunnels access token
3. Click "Test Connection"
4. Click "Save"

#### Problem D: Webhook Endpoint Not Accessible
**Symptoms:**
```json
{
  "webhookEndpoint": {
    "accessible": false
  }
}
```

**Fix:**
1. Verify your app is deployed
2. Check `NEXT_PUBLIC_SITE_URL` environment variable
3. Try accessing the URL manually
4. Check Vercel/hosting logs for errors

### Step 3: Test the Fix

1. **Test webhook handler:**
   ```
   https://yourdomain.com/api/debug/test-webhook
   ```
   Should create a test order

2. **Place a real test order** in Lightfunnels

3. **Check status again:**
   ```
   https://yourdomain.com/api/debug/webhook-status
   ```
   Should show new orders

---

## 🛠️ Common Fixes

### Fix 1: Configure Lightfunnels Webhook

**In Lightfunnels Dashboard:**
1. Go to Settings → Integrations → Webhooks
2. Click "Add Webhook"
3. Configure:
   ```
   URL: https://yourdomain.com/api/webhooks/lightfunnels
   Events: ✅ order/created
           ✅ checkout/created
   Secret Header Name: x-webhook-secret
   Secret Header Value: [your LIGHTFUNNELS_WEBHOOK_SECRET]
   ```
4. Save
5. Click "Send Test"

### Fix 2: Set Environment Variables

**Required variables:**
```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Webhook security (recommended)
LIGHTFUNNELS_WEBHOOK_SECRET=your_secret_here
WEBHOOK_LOGGING_ENABLED=true

# QStash (required for checkout processing)
QSTASH_TOKEN=xxx
QSTASH_CURRENT_SIGNING_KEY=xxx
QSTASH_NEXT_SIGNING_KEY=xxx

# Site URL (required for webhooks)
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

**How to set in Vercel:**
```bash
vercel env add LIGHTFUNNELS_WEBHOOK_SECRET
vercel env add QSTASH_TOKEN
# ... etc
```

### Fix 3: Configure Lightfunnels API Token

**Via Settings Page:**
1. Go to your app → Settings → Lightfunnels
2. Get access token from Lightfunnels:
   - Go to Lightfunnels Dashboard
   - Settings → API → Generate Token
3. Paste token in your app
4. Click "Test Connection"
5. Click "Save"

### Fix 4: Process Stuck Checkouts

**Manual processing:**
```
https://yourdomain.com/api/cron/process-checkouts-manual
```

**Automatic processing (requires QStash):**
- Checkouts are processed automatically 2 minutes after being queued
- Configure QStash environment variables (see above)

---

## 📊 Understanding the Response

### webhook-status Response Structure

```json
{
  "timestamp": "2026-03-18T...",
  "status": "ok" | "warning" | "error",

  "environment": {
    "supabaseUrl": true,
    "webhookSecret": false,  // ⚠️ Not set
    "qstashToken": true
  },

  "lightfunnelsToken": {
    "configured": true,
    "lastUpdated": "2026-03-15T..."
  },

  "ordersLast24h": {
    "total": 10,
    "fromLightfunnels": 5,
    "completedOrders": 4,
    "abandonedCheckouts": 1
  },

  "checkoutQueue": {
    "pending": 0,
    "failed": 0
  },

  "webhookEndpoint": {
    "url": "https://yourdomain.com/api/webhooks/lightfunnels",
    "accessible": true
  },

  "issues": [
    "QSTASH_TOKEN not set - abandoned checkout processing will fail"
  ],

  "recommendations": [
    {
      "priority": "high",
      "action": "Configure QStash",
      "reason": "Required for checkout processing"
    }
  ]
}
```

---

## 🔗 All Diagnostic Endpoints

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/api/debug/webhook-status` | Comprehensive status check | GET |
| `/api/debug/test-webhook` | Send test webhook | GET |
| `/api/cron/process-checkouts-manual` | Process pending checkouts | GET |
| `/api/webhooks/lightfunnels` | Webhook endpoint (for Lightfunnels) | POST |
| `/api/lightfunnels/sync` | Manual order sync | POST |

---

## 💡 Pro Tips

1. **Enable webhook logging** during debugging:
   ```bash
   WEBHOOK_LOGGING_ENABLED=true
   ```
   Then check your server logs

2. **Check Vercel logs** for webhook attempts:
   ```bash
   vercel logs --follow
   ```

3. **Test locally** with ngrok:
   ```bash
   ngrok http 3000
   # Use ngrok URL in Lightfunnels webhook
   ```

4. **Check Lightfunnels webhook delivery logs**:
   - Go to Lightfunnels → Webhooks
   - Click on your webhook
   - View "Recent Deliveries"
   - Look for failed attempts

---

## 🆘 Still Not Working?

If none of the above helps:

1. **Check the full status:**
   ```
   https://yourdomain.com/api/debug/webhook-status
   ```

2. **Copy the entire JSON response**

3. **Check for these specific issues:**
   - `status: "error"` - Critical issues listed in `issues` array
   - `ordersLast24h.fromLightfunnels: 0` - No webhooks being received
   - `checkoutQueue.pending > 0` - Checkouts stuck
   - `webhookEndpoint.accessible: false` - Endpoint unreachable

4. **Look at the `recommendations` array** - it tells you exactly what to fix

5. **Check your server logs** for webhook POST requests

6. **Verify Lightfunnels webhook delivery logs** to see if they're even attempting to send webhooks

---

## ✅ Success Checklist

After fixing, verify everything works:

- [ ] `/api/debug/webhook-status` shows `status: "ok"`
- [ ] `/api/debug/test-webhook` creates a test order
- [ ] Real test order in Lightfunnels appears in your app
- [ ] No pending checkouts in queue
- [ ] Recent orders show up in webhook-status response
- [ ] No critical issues in recommendations

---

## 📞 Quick Reference

**Your webhook URL:**
```
https://yourdomain.com/api/webhooks/lightfunnels
```

**Webhook events to enable in Lightfunnels:**
- `order/created` - When customer completes purchase
- `checkout/created` - When customer abandons cart

**Webhook secret header:**
- Name: `x-webhook-secret`
- Value: Your `LIGHTFUNNELS_WEBHOOK_SECRET` env var
