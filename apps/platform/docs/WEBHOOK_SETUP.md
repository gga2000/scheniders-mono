# LightFunnels Webhook Integration - Setup Guide

## 🎯 Overview

Your order management system now automatically imports orders from LightFunnels! When a customer places an order on LightFunnels, it instantly appears in your dashboard.

---

## 📋 Setup Instructions

### Step 1: Add Webhook Secret to Environment

The webhook secret has already been added to your `.env.local`:

```bash
LIGHTFUNNELS_WEBHOOK_SECRET=my_super_secret_webhook_token_12345
WEBHOOK_LOGGING_ENABLED=true
```

**For production**, you'll need to:
1. Generate a strong random secret
2. Add it to your Vercel/hosting environment variables
3. Use the same secret in LightFunnels

---

### Step 2: Deploy to Production

Deploy your app to get a public URL:

```bash
# If using Vercel
vercel

# Or push to your Git repo if auto-deploy is set up
git add .
git commit -m "Add LightFunnels webhook"
git push
```

Wait for deployment to complete and note your production URL.

---

### Step 3: Configure LightFunnels

1. Go to your LightFunnels dashboard
2. Navigate to Settings → Webhooks
3. Click "Add Webhook"
4. Configure:
   - **URL**: `https://yourdomain.com/api/webhooks/lightfunnels`
   - **Event**: Order Created
   - **Secret** (if supported): `my_super_secret_webhook_token_12345`
   - **Method**: POST
5. Save the webhook

**Custom Header (if LightFunnels supports it):**
- Header Name: `x-webhook-secret`
- Header Value: `your_secret_token`

---

### Step 4: Test the Integration

#### Option A: Test Locally (Before Deployment)

Run the test script:

```bash
npx ts-node scripts/test-webhook.ts
```

You should see:
- ✅ SUCCESS! Order created from webhook
- Check your dashboard for the test order

#### Option B: Test with Real Order

1. Place a test order in LightFunnels
2. Check your dashboard
3. Order should appear within seconds!

---

## 🔧 Webhook Endpoint Details

### URL
```
POST https://yourdomain.com/api/webhooks/lightfunnels
```

### Authentication
Send secret in header:
```
x-webhook-secret: your_secret_token_here
```

### Expected Payload Format
```json
{
  "event": "order.created",
  "order_id": "LF12345",
  "customer": {
    "name": "أحمد محمد",
    "phone": "07701234567",
    "email": "customer@example.com",
    "city": "بغداد",
    "governorate": "BG",
    "address": "Full address here"
  },
  "items": [
    {
      "name": "Product Name",
      "quantity": 1,
      "price": 75000
    }
  ],
  "total": 75000,
  "created_at": "2024-12-15T10:30:00Z",
  "notes": "Optional notes"
}
```

### Response Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Success | Order created successfully |
| 200 | Duplicate | Order already exists (not an error) |
| 400 | Bad Request | Invalid payload format |
| 401 | Unauthorized | Missing or invalid webhook secret |
| 403 | Forbidden | Customer is blacklisted |
| 500 | Server Error | Database or processing error |

---

## ✨ Features

### 1. **Automatic Order Creation**
- Orders appear instantly in dashboard
- No manual data entry needed
- Real-time stats updates

### 2. **Duplicate Detection**
- Prevents same order from being imported twice
- Uses LightFunnels order ID for tracking
- Returns success (200) for duplicates

### 3. **Blacklist Protection**
- Automatically checks customer phone against blacklist
- Rejects orders from blacklisted numbers
- Logs rejection reason

### 4. **Phone Number Formatting**
- Accepts any Iraqi format: `07XXXXXXXX`, `+9647XXXXXXXX`, `9647XXXXXXXX`
- Converts all to standard: `+9647XXXXXXXX`
- Works with WhatsApp integration

### 5. **Order ID Mapping**
- LightFunnels ID: `12345` → Our ID: `LF-12345`
- Maintains connection to source
- Easy tracking and debugging

### 6. **Error Logging**
- All requests logged (if enabled)
- Detailed error messages
- Easy troubleshooting

---

## 🧪 Testing

### Local Testing

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Run test script:**
   ```bash
   npx ts-node scripts/test-webhook.ts
   ```

3. **Check dashboard** for new test order

### Test Duplicate Detection

Uncomment the duplicate test in `scripts/test-webhook.ts`:

```typescript
// Uncomment to test duplicate detection
await testDuplicate();
```

Run again - should detect duplicate on second attempt.

### Test Blacklist

1. Add a phone number to blacklist in Supabase
2. Update test script with that phone
3. Run test - should be rejected with 403

---

## 🐛 Troubleshooting

### Webhook not receiving requests?

1. **Check LightFunnels configuration**
   - URL is correct
   - Event is "Order Created"
   - Webhook is enabled

2. **Check deployment**
   - App is deployed
   - URL is accessible
   - Environment variables are set

3. **Check logs**
   - Look at Vercel/hosting logs
   - Check for 401 errors (wrong secret)
   - Check for 400 errors (wrong format)

### Orders not appearing?

1. **Check webhook logs** (if enabled)
2. **Check Supabase database**
   - RLS policies allow inserts
   - No database errors
3. **Check for duplicates** - Maybe order already exists

### Wrong data mapping?

If LightFunnels sends different field names:
1. Update `parseLightFunnelsPayload` in `lib/webhook-handler.ts`
2. Map their fields to ours
3. Test with real payload

---

## 📊 Monitoring

### Enable Logging

Already enabled in your `.env.local`:
```bash
WEBHOOK_LOGGING_ENABLED=true
```

This logs every webhook request to console.

### View Logs

**Development:**
- Check terminal where `npm run dev` is running
- See real-time webhook attempts

**Production (Vercel):**
- Go to Vercel dashboard
- Navigate to your project
- Click "Logs"
- Filter by `/api/webhooks/lightfunnels`

---

## 🔒 Security Best Practices

### For Production:

1. **Strong Secret**
   ```bash
   # Generate a random secret
   openssl rand -hex 32
   ```

2. **Environment Variables**
   - Never commit secrets to Git
   - Use hosting platform's secrets manager
   - Different secret for dev/prod

3. **Optional: IP Whitelist**
   Add to `route.ts`:
   ```typescript
   const allowedIPs = ['1.2.3.4']; // LightFunnels IPs
   const clientIP = request.ip;
   if (!allowedIPs.includes(clientIP)) {
     return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   }
   ```

---

## 📝 What Happens When Webhook Receives Order

1. **Verify Secret** - Check authentication
2. **Parse Payload** - Extract order data
3. **Validate Data** - Ensure all required fields
4. **Check Blacklist** - Verify phone not blacklisted
5. **Check Duplicate** - Look for existing order
6. **Format Phone** - Convert to standard format
7. **Create Order** - Insert into Supabase
8. **Generate WhatsApp** - Create chat link
9. **Update Stats** - Real-time dashboard update
10. **Return Success** - Respond to LightFunnels

**Total time: < 500ms**

---

## 🎉 Success!

Once configured, you'll never need to manually enter orders again!

- Orders flow automatically from LightFunnels
- Appear instantly in dashboard
- Ready for fulfillment
- Focus on growing your business! 🚀
