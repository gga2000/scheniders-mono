# Implementation Plan: WhatsApp Templates, Auto-Send Pipeline, Contact Count & Visual Cues

---

## Current Architecture Summary

| Layer | File | Purpose |
|-------|------|---------|
| Types | `types/order.ts` | `Order` interface (has `contact_count?: number`, no `last_contacted_at`) |
| Interakt Client | `lib/interakt.ts` | `sendTemplateMessage()` — sends `cod_order_confirm` template only |
| Send API | `app/api/webhooks/interakt/send/route.ts` | POST endpoint — sends template, auto-updates status to `contacted`, logs to `whatsapp_logs` |
| Webhook Receiver | `app/api/webhooks/interakt/route.ts` | Receives delivery/read/click events from Interakt |
| Cron | `app/api/cron/auto-no-response/route.ts` | Daily cron — moves `contacted` > 2 days → `no_response` |
| UI Template Panel | `components/orders/whatsapp-template-panel.tsx` | Manual template selector with Interakt send (confirmation only) |
| Mobile Card | `components/mobile/orders/MobileOrderCard.tsx` | WhatsApp buttons — **no contact count indicator currently** |
| Mobile Page | `components/mobile/orders/MobileOrdersPage.tsx` | Page wrapper — no auto-send toggle |

---

## Feature 1: New WhatsApp Templates (Reminder & Discount)

### 1A. Draft Arabic Templates for Meta/Interakt Submission

#### Reminder Template (`order_reminder`)
**Language:** Arabic
**Category:** Utility (follow-up)
**Header:** None
**Body:**

```
مرحباً {{1}} 👋

هذه رسالة تذكيرية بخصوص طلبك رقم #{{2}} 📦

🛍️ المنتجات: {{3}}
📍 العنوان: {{4}}
💰 المبلغ: {{5}}

نرجو تأكيد الطلب بالضغط على الزر أدناه حتى نتمكن من شحنه في أقرب وقت ⏳

شكراً لاختياركم! 🙏
```

**Footer:** `Schneiders Iraq`
**Buttons:**
- `تأكيد ✅` (Quick Reply)
- `إلغاء ❌` (Quick Reply)

**Body Variables ({{1}} – {{5}}):**
1. Customer name
2. Order number
3. Products list
4. Address
5. Total price

---

#### Sweeten the Deal / Discount Template (`order_discount_offer`)
**Language:** Arabic
**Category:** Marketing
**Header:** None
**Body:**

```
مرحباً {{1}} 🌟

لاحظنا أنك لم تؤكد طلبك بعد رقم #{{2}}، وعندنا خبر حلو! 🎁

قررنا نقدملك خصم خاص {{3}}% على طلبك! 🔥

🛍️ المنتجات: {{4}}
💰 السعر الأصلي: {{5}}
🏷️ السعر بعد الخصم: {{6}}

العرض لفترة محدودة — أكّد طلبك الآن! ⬇️
```

**Footer:** `Schneiders Iraq`
**Buttons:**
- `تأكيد بالخصم ✅` (Quick Reply)
- `لا شكراً` (Quick Reply)

**Body Variables ({{1}} – {{6}}):**
1. Customer name
2. Order number
3. Discount percentage
4. Products list
5. Original price
6. Discounted price

---

### 1B. Backend: Multi-Template Support in `lib/interakt.ts`

**Changes:**

1. **Add template name constants:**
```ts
const TEMPLATES = {
  confirmation: "cod_order_confirm",
  reminder: "order_reminder",
  discount: "order_discount_offer",
} as const;
```

2. **Add `buildReminderBody()` function** — builds body with 5 variables (name, order#, products, address, price)

3. **Add `buildDiscountBody(discountPercent)` function** — builds body with 6 variables (name, order#, discount%, products, original price, discounted price)

4. **Refactor `sendTemplateMessage()`** to accept a `templateType` parameter:
```ts
export async function sendTemplateMessage(
  order: Order,
  templateType: 'confirmation' | 'reminder' | 'discount' = 'confirmation',
  overridePhone?: string,
  discountPercent?: number,
): Promise<SendTemplateResult>
```

### 1C. Backend: Update Send API Route

**File:** `app/api/webhooks/interakt/send/route.ts`

- Accept `templateType` and `discountPercent` in the POST body
- Pass to `sendTemplateMessage()`
- Log the correct `template_name` in `whatsapp_logs`
- Increment `contact_count` in DB on successful send
- Add `last_contacted_at` timestamp update

### 1D. Frontend: Update WhatsApp Template Panel

**File:** `components/orders/whatsapp-template-panel.tsx`

- The template type selector (confirmation/reminder/discount) already exists in UI
- **Change:** Enable the Interakt "Send Template" button for ALL template types (currently gated to `confirmation` only at line 447: `{selectedType === 'confirmation' && (...)}`)
- Pass `selectedType` and `discountPercent` to the API call

---

## Feature 2: Automated Sending Pipeline & Toggle

### 2A. Database Changes

**New column on `orders` table:**
```sql
ALTER TABLE orders ADD COLUMN last_contacted_at TIMESTAMPTZ DEFAULT NULL;
```

**New settings table (or use existing app_settings):**
```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial auto-send setting
INSERT INTO app_settings (key, value) VALUES ('whatsapp_auto_send', '{"enabled": false}');
```

**Update `contact_count` to increment on every send** (currently exists but not reliably updated in the send route).

### 2B. Auto-Send API Route

**New file:** `app/api/cron/auto-send-whatsapp/route.ts`

**Logic (runs every 5–10 minutes via Vercel Cron):**
1. Check `app_settings` → is `whatsapp_auto_send.enabled` true?
2. If NO → return immediately
3. If YES → query orders where:
   - `status = 'new'` AND `contact_count = 0` AND `created_at > now() - 1 hour` (batch window)
   - Phone is valid
4. For each qualifying order:
   - Send confirmation template via `sendTemplateMessage()`
   - Update `status → contacted`, increment `contact_count`, set `last_contacted_at`
   - Log to `whatsapp_logs`
5. Return count of sent messages

**Rate limiting:** Process max 10 orders per cron invocation to stay within Interakt rate limits. Add 500ms delay between sends.

### 2C. Auto-Send Settings API

**New file:** `app/api/settings/auto-send/route.ts`

- `GET` → returns current auto-send state
- `PUT` → updates the toggle state
- Uses `app_settings` table

### 2D. Frontend: Auto-Send Toggle

**File:** `components/mobile/orders/MobileOrdersPage.tsx` (and desktop equivalent)

**UI Design — Premium Toggle:**
- Position: In the sticky header bar, between the export button and search
- Appearance: A pill-shaped toggle with a WhatsApp icon + "Auto" text
  - **OFF state:** Gray background, muted icon
  - **ON state:** Green gradient background (`from-green-400 to-emerald-500`), white icon, subtle pulse animation
- Clicking the toggle calls `PUT /api/settings/auto-send`
- Fetches initial state via `GET /api/settings/auto-send` on mount

**Component:** New `AutoSendToggle` component in `components/orders/auto-send-toggle.tsx`

---

## Feature 3: Contact Count Indicator (Bug Fix)

### 3A. Backend: Reliable `contact_count` Increment

**Current issue:** `contact_count` is incremented on the frontend via `onContactSent` callback, but the send API route (`/api/webhooks/interakt/send`) does NOT update `contact_count` in the database. It only updates `status`.

**Fix in `app/api/webhooks/interakt/send/route.ts`:**
```ts
// After successful send, atomically increment contact_count
await supabaseAdmin
  .from("orders")
  .update({
    status: "contacted",
    contact_count: (order.contact_count || 0) + 1,
    last_contacted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq("id", order.id);
```

**Better approach — Use Supabase RPC for atomic increment:**
```sql
CREATE OR REPLACE FUNCTION increment_contact_count(order_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE orders
  SET contact_count = COALESCE(contact_count, 0) + 1,
      last_contacted_at = NOW(),
      updated_at = NOW()
  WHERE id = order_uuid;
END;
$$ LANGUAGE plpgsql;
```

### 3B. Frontend: Contact Count Badge on WhatsApp Buttons

**File:** `components/mobile/orders/MobileOrderCard.tsx`

Add a tiny white circle badge overlapping the WhatsApp button:

```tsx
<button className="relative w-8 h-8 ...">
  <MessageCircle className="w-4 h-4" />
  {order.contact_count > 0 && (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-white text-[10px] font-bold text-gray-800 flex items-center justify-center shadow-sm border border-gray-200">
      {order.contact_count}
    </span>
  )}
</button>
```

**Also apply to:**
- Desktop `OrderCard` (if it has WhatsApp buttons)
- `OrderDetailsModal` WhatsApp section

---

## Feature 4: Time-Based Visual Cues & Auto-Follow-ups

### 4A. Visual Cue Logic (Frontend)

**Thresholds (configurable):**
| Elapsed Time | Template Sent | Visual Cue |
|---|---|---|
| 0 – 24h | Confirmation | Normal (no cue) |
| 24h+ | Confirmation only | **Amber glow** — "Send Reminder" |
| 48h+ | Reminder sent | **Red glow** — "Send Discount Offer" |
| 72h+ | Discount sent | Move to `no_response` (existing cron handles this) |

**Implementation in `MobileOrderCard.tsx`:**

1. Compute `hoursSinceContact = (now - last_contacted_at) / 3600000`
2. Determine which cue to show based on `contact_count` + `hoursSinceContact`:
   - `contact_count === 1 && hoursSinceContact >= 24` → Amber reminder badge
   - `contact_count === 2 && hoursSinceContact >= 24` → Red discount badge (48h since first contact)
   - `contact_count >= 3` → No cue (already exhausted follow-ups)

**Visual Design:**
```tsx
{needsReminder && (
  <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold animate-pulse border border-amber-300 shadow-sm">
    <Bell className="w-2.5 h-2.5" />
    تذكير
  </div>
)}

{needsDiscount && (
  <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold animate-pulse border border-red-300 shadow-sm">
    <Gift className="w-2.5 h-2.5" />
    عرض خاص
  </div>
)}
```

Additionally, the card's left color accent strip changes:
- Normal contacted → blue
- Needs reminder → amber/pulsing
- Needs discount → red/pulsing

### 4B. Auto-Follow-up (Cron Extension)

**Extend** `app/api/cron/auto-send-whatsapp/route.ts` to handle follow-ups:

**Step 2 (after auto-sending confirmation to new orders):**
1. Query orders where `status = 'contacted'` AND `contact_count = 1` AND `last_contacted_at < now() - 24h`
2. If auto-send is ON → send Reminder template automatically
3. Update `contact_count → 2`, `last_contacted_at → now()`

**Step 3:**
1. Query orders where `status = 'contacted'` AND `contact_count = 2` AND `last_contacted_at < now() - 24h`
2. If auto-send is ON → send Discount template automatically (with default 10% discount)
3. Update `contact_count → 3`, `last_contacted_at → now()`

---

## Database Migration Summary

```sql
-- 1. Add last_contacted_at column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Insert default auto-send setting
INSERT INTO app_settings (key, value)
VALUES ('whatsapp_auto_send', '{"enabled": false, "default_discount_percent": 10}')
ON CONFLICT (key) DO NOTHING;

-- 4. Atomic contact count increment function
CREATE OR REPLACE FUNCTION increment_contact_count(order_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE orders
  SET contact_count = COALESCE(contact_count, 0) + 1,
      last_contacted_at = NOW(),
      updated_at = NOW()
  WHERE id = order_uuid;
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill last_contacted_at for existing contacted orders
UPDATE orders
SET last_contacted_at = updated_at
WHERE status IN ('contacted', 'no_response')
  AND last_contacted_at IS NULL;
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `types/order.ts` | EDIT | Add `last_contacted_at?: string` to Order interface |
| `lib/interakt.ts` | EDIT | Add multi-template support (reminder + discount builders) |
| `app/api/webhooks/interakt/send/route.ts` | EDIT | Accept `templateType`, increment `contact_count`, set `last_contacted_at` |
| `app/api/cron/auto-send-whatsapp/route.ts` | NEW | Cron for auto-send pipeline (confirmation + reminder + discount) |
| `app/api/settings/auto-send/route.ts` | NEW | GET/PUT for auto-send toggle state |
| `components/orders/auto-send-toggle.tsx` | NEW | Premium toggle component |
| `components/orders/whatsapp-template-panel.tsx` | EDIT | Enable send for all template types |
| `components/mobile/orders/MobileOrderCard.tsx` | EDIT | Add contact count badge + time-based visual cues |
| `components/mobile/orders/MobileOrdersPage.tsx` | EDIT | Add auto-send toggle to header |
| `scripts/sql/auto-send-migration.sql` | NEW | SQL migration script |

---

## Execution Order

1. **Phase 1 — Database & Types** (migration + type updates)
2. **Phase 2 — Backend Templates** (multi-template Interakt support + send route)
3. **Phase 3 — Contact Count Fix** (atomic increment, badge UI)
4. **Phase 4 — Auto-Send Pipeline** (settings API, cron job, toggle UI)
5. **Phase 5 — Visual Cues** (time-based badges, card accent changes)
6. **Phase 6 — Testing & Polish**

---

## Questions for You

1. **Reminder timing threshold:** I've set 24 hours between each follow-up step. Would you prefer a different interval (e.g., 12h, 36h, 48h)?

2. **Default discount percentage for auto-send:** I've set 10%. Should it be different, or should it be configurable per-order?

3. **Cron frequency:** The auto-send cron runs every 10 minutes. Vercel free tier allows hourly crons. Do you have Vercel Pro (supports per-minute crons)?

4. **Interakt template names:** I've proposed `order_reminder` and `order_discount_offer` as template names. Do you want different names to match your Interakt dashboard naming convention?

5. **Button text for Discount template:** I used "تأكيد بالخصم ✅" and "لا شكراً". Should the second button be different (e.g., "إلغاء الطلب ❌")?