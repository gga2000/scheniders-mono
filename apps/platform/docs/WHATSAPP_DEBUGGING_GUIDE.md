# WhatsApp Button Click Debugging Guide

## ✅ Step 1: Verify Interakt Webhook Configuration

### Go to Interakt Dashboard
1. Login to https://app.interakt.ai
2. Navigate to **Settings** → **Developers** → **Webhooks**

### Check These Settings:

#### A. Webhook URL
**Must be exactly:**
```
https://schneiders-orders.vercel.app/api/webhooks/interakt
```

**Common mistakes:**
- Missing `/api/webhooks/interakt` path
- Using HTTP instead of HTTPS
- Wrong domain name
- Trailing slash

#### B. Webhook Events Enabled
Make sure these events are **checked/enabled**:
- ✅ **Message Received** (for text responses)
- ✅ **Button Clicked** (for button clicks)
- ✅ **Message Sent**
- ✅ **Message Delivered**
- ✅ **Message Read**
- ✅ **Message Failed**

#### C. Webhook Secret (Optional)
If you have set `INTERAKT_WEBHOOK_SECRET` in Vercel environment variables:
- The secret in Interakt dashboard must **exactly match**
- Otherwise, set webhook secret to empty/disabled in Interakt

---

## 🧪 Step 2: Test the Webhook

### Option A: Send Test Webhook from Interakt
Most webhook configurations have a "Send Test" button. Click it and check Vercel logs.

### Option B: Simulate Button Click (Recommended)
Use this test endpoint to simulate what Interakt sends:

```javascript
// Run this in your browser console on schneiders-orders.vercel.app
fetch('/api/webhooks/interakt/test-button-click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    orderUuid: 'PASTE-REAL-ORDER-UUID-HERE',  // From orders table
    phone: '9647XXXXXXXXX',                    // Real phone from order
    buttonText: 'تأكيد'                        // Or 'إلغاء'
  })
}).then(r => r.json()).then(console.log);
```

**Expected successful response:**
```json
{
  "success": true,
  "mockPayload": { ... },
  "webhookResponse": {
    "success": true,
    "message": "Order 4260319020 updated to confirmed",
    "order_id": "4260319020",
    "new_status": "confirmed"
  }
}
```

**If it fails, check the error message in the response.**

---

## 🔍 Step 3: Check Real Button Clicks

### A. Send a Test WhatsApp Message
1. Go to your orders dashboard
2. Find a test order with status "new"
3. Click "Send WhatsApp" to send the confirmation template
4. Order status should change to "contacted"

### B. Click the Button on Your Phone
1. Open WhatsApp on your phone (use the phone number from the order)
2. You should receive a message with buttons: "تأكيد ✅" and "إلغاء ❌"
3. Click "تأكيد ✅"

### C. Check What Happened

#### Check Vercel Logs:
```bash
# If you installed Vercel CLI:
vercel logs --follow

# Or go to: https://vercel.com/dashboard → your project → Logs
```

**Look for these log entries:**
```
[Interakt Webhook] Received: { type: "message_api_clicked", ... }
[Interakt Webhook] 🔍 Step 4 - Extracted response text: "تأكيد"
[Interakt Webhook] 🔍 Step 5 - Matched action: confirmed
[Interakt Webhook] 🔍 Step 6 - Looking for order...
[Interakt Webhook] ✅ Found order: 4260319020
```

#### Check Database:
Run this SQL in Supabase:

```sql
-- Check if webhook was received
SELECT
    created_at,
    order_id,
    direction,
    status,
    payload->'type' as webhook_type
FROM whatsapp_logs
WHERE direction = 'inbound'
ORDER BY created_at DESC
LIMIT 5;
```

**If you see results** = Webhooks are being received ✅
**If empty** = Interakt is NOT sending webhooks to your server ❌

---

## 🐛 Common Issues & Solutions

### Issue 1: No Webhooks Received
**Symptoms:** Button clicks do nothing, no logs in Vercel, no entries in `whatsapp_logs` with direction='inbound'

**Solution:**
1. Verify webhook URL in Interakt dashboard is **exactly**: `https://schneiders-orders.vercel.app/api/webhooks/interakt`
2. Verify "Button Clicked" event is enabled in Interakt
3. Check if webhook secret is causing 401 errors (check Vercel logs)

### Issue 2: Webhook Secret Mismatch
**Symptoms:** Vercel logs show `[Interakt Webhook] Secret mismatch`

**Solution:**
1. Go to Vercel dashboard → Project → Settings → Environment Variables
2. Find `INTERAKT_WEBHOOK_SECRET`
3. Copy the exact value
4. Go to Interakt dashboard → Webhooks → Set the same secret
5. **OR** remove the secret from both places

### Issue 3: Order Not Found
**Symptoms:** Logs show `❌ No matching order found`

**Solution:**
This means the `callback_data` (order UUID) isn't matching. Check:
1. The order UUID is being passed when sending messages (already fixed in our code)
2. The order exists in database and has status "contacted"
3. Phone number format matches

### Issue 4: Order Already Confirmed
**Symptoms:** Logs show `Order already in "confirmed" status, skipping update`

**Solution:**
This is normal! Duplicate button clicks are ignored. The first click already confirmed the order.

### Issue 5: Button Text Not Recognized
**Symptoms:** Logs show `⚠️ Unmatched response: "..."`

**Solution:**
The button text doesn't match expected patterns. Check that your Interakt template buttons have text:
- "تأكيد" or "تأكيد ✅" for confirm
- "إلغاء" or "إلغاء ❌" for cancel

---

## 📊 Quick Diagnostic SQL Queries

Run these in Supabase SQL Editor:

### 1. Recent Outbound Messages
```sql
SELECT created_at, order_id, status, phone
FROM whatsapp_logs
WHERE direction = 'outbound'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Recent Inbound Webhooks (Button Clicks)
```sql
SELECT
    created_at,
    order_id,
    payload->'type' as webhook_type,
    payload->'data'->'message'->'button_reply'->>'title' as button_text
FROM whatsapp_logs
WHERE direction = 'inbound'
ORDER BY created_at DESC
LIMIT 10;
```

### 3. Orders Waiting for Confirmation
```sql
SELECT order_id, status, last_contacted_at, phone
FROM orders
WHERE status = 'contacted'
AND last_contacted_at > NOW() - INTERVAL '24 hours'
ORDER BY last_contacted_at DESC;
```

### 4. Recent Status Changes from WhatsApp Bot
```sql
SELECT
    osh.changed_at,
    o.order_id,
    osh.from_status,
    osh.to_status,
    osh.notes
FROM order_status_history osh
JOIN orders o ON o.id = osh.order_id
WHERE osh.changed_by = 'whatsapp_bot'
ORDER BY osh.changed_at DESC
LIMIT 10;
```

---

## ✨ Expected Behavior

When everything is working correctly:

1. **Send Message** → Order status changes to "contacted"
2. **Customer clicks "تأكيد"** → Order status changes to "confirmed"
3. **Customer clicks "إلغاء"** → Order status changes to "cancelled"
4. **All interactions logged** in `whatsapp_logs` table
5. **Status history tracked** in `order_status_history` table

---

## 🆘 Still Not Working?

If you've checked everything above and it's still not working:

1. Share the results of SQL Query #2 (inbound webhooks)
2. Share a screenshot of Interakt webhook configuration
3. Share recent Vercel logs when you click a button
4. We'll debug further from there!
