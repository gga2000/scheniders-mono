# Storefront conversion fixes — design concepts (brainstorm)

Date: 2026-11-01. Source: storefront audit rounds 1-2 (`/mnt/project-files/storefront-audit/`, 66 → 62 / 100 on deeper evidence). Status: **concepts for Ali to pick; nothing built yet.**

Settled by Ali, kept as-is: trefoil logo, «صُنع في العراق بكل حب», «آراء كشايخنا», countdown, struck price, discount badge, free delivery, ~24 h delivery, refuse-at-door / 1-week return, calm Apple-like look, LTR document. Returns deduct 5,000 IQD delivery, stated only on policy pages. No tax, no international shipping.

Every concept: 2-3 approaches, one recommended (★), what "world class" means here, how we prove it worked.

---

## C1. Product page first screen (ads land here)

Problem: COD/free-delivery/try-before-pay proof sits below «ثبّت طلبي»; gallery can't be swiped (13 of 14 Wafer photos hidden).

| | Approach | Trade-off |
|---|---|---|
| A ★ | **Trust line under price + swipe gallery.** One line: «الدفع عند الاستلام · التوصيل مجاني · تفتح وتجرّب قبل لا تدفع». Gallery = native CSS scroll-snap strip (no JS lib), «1 / 14» counter, dots, tap opens full-screen zoom with pinch. First image `priority`, rest lazy. | Small, no layout risk, works with JS off. |
| B | Sticky trust chip row over the gallery. | Covers the photo, the thing that sells perfume. |
| C | Video-first hero (bottle + spray clip). | Strong, but needs content Ali doesn't have yet; heavy on 3G. |

Proof: tap-to-order rate on Wafer before/after (funnel beacon already exists).

## C2. Sold-out product page

Problem: dead end; yellow «اطلب الآن» sticky bar still shows.

| | Approach | Trade-off |
|---|---|---|
| A ★ | **«بلّغني أول ما يتوفر» + 3 similar in-stock.** One phone field (same validation as checkout), saved per product per tenant (new table, RLS, tenant from host, never from client). Merchant sees the list on the product in the platform app and gets WhatsApp links to send (we never message customers automatically). Below: 3 in-stock products with the same gender/notes. Hide sticky order bar. | Needs a small table + platform list. Turns dead traffic into a lead list. |
| B | Similar products only. | No lead captured. |
| C | Redirect sold-out URLs to the closest in-stock product. | Confuses ad clicks; breaks shared links. |

## C3. Lists and categories

Problem: sold-out mixed in; «رجالية» misses 3 men's perfumes; 7 chip rows push products off screen 1.

| | Approach | Trade-off |
|---|---|---|
| A ★ | **In-stock first everywhere (server sort) + one «فلتر» bottom sheet** (gender, price, notes, in-stock toggle) with live result count; categories driven by product data (gender tag), not hand lists. | Fixes the root (data) not the symptom. |
| B | Keep chips, just collapse to one row. | Still no in-stock sort. |

## C4. Product content standard

Problem: 13 English-only stories; 32 products with 1 photo; 8 empty notes cards; 11 of 43 with gender.

| | Approach | Trade-off |
|---|---|---|
| A ★ | **Content checklist in the platform product editor** (score per product: Arabic story, ≥4 photos, notes, gender, longevity) + storefront hides empty blocks. Story template, Iraqi voice: opening line → 3 notes → when to wear → how long it lasts. I draft the 13 Arabic stories for Ali to approve. | Content work, but compounding. |
| B | Machine-translate English stories. | Fast; reads like a translation, hurts trust. |

## C5. /track

Problem: needs order number AND phone; not live; «MOS» code shown; 3 number formats.

| | Approach | Trade-off |
|---|---|---|
| A ★ | **Phone OR order number.** Phone-only returns that phone's last 3 orders, **masked** (items count, status, date; no name/address). Keep existing per-IP/phone/order rate limits. **Live:** poll the lookup every 45 s only while the tab is visible (Page Visibility), stop on delivered/cancelled. No public realtime channel (would expose order rows). Governorate shown by Arabic name. Status as a 4-step timeline. | Safe and simple. |
| B | Supabase Realtime on orders. | Needs anon access to order changes; leak risk. Rejected. |
| C | WhatsApp status push. | Best UX, but outbound messaging cost and setup; later. |

## C6. Menu

Problem: 4 links, left-aligned in Arabic.

★ Search field on top → 6 category tiles (رجالي، نسائي، الأكثر مبيعاً…) → «تتبّع طلبك» → WhatsApp → policies. Right-aligned text inside the LTR shell. Remove English switch (half translated) until English is complete.

## C7. Typography and icons (speed + brand)

Problem: font is Cairo (not on Ali's list); ~700 KB fonts per page; icon font 387 KB with `display=block` (invisible icons on slow nets).

| | Approach | Trade-off |
|---|---|---|
| A ★ | **IBM Plex Sans Arabic (body, 400/600) + Readex Pro (display, one weight)**, self-hosted via `next/font`, Arabic + Latin digits subset. Icons: inline SVG components (~28 icons, ~6 KB). Target fonts < 120 KB. | Biggest speed win on Iraqi 3G (~1.5 s). |
| B | Tajawal only. | Lighter, less refined at display sizes. |

## C8. Colour contrast

★ One token change: muted ink `#7e746e` → `#6b625c` (≈5.3:1 on cream). No text under 12 px. Re-run axe: target 0 serious contrast issues on 67 pages.

## C9. Live orders stat (home)

★ Server component counts placed orders (exclude `pending_checkout`) for the tenant, cached with a tag; order insert revalidates the tag. Display floors to the nearest 500: 5,236 → «+5,000 طلب», becomes «+5,500» on its own. No client polling, no exact number leaked.

## C10. Trust copy and policies

- PDP card + About: drop «فلوسك كاملة» / «ونرجعلك فلوسه». Keep «ترفضه قدام المندوب أو ترجّعه خلال أسبوع — الشروط».
- Returns policy: «ترجّعه خلال أسبوع وترجع فلوسك مطروح منها 5,000 د.ع أجور التوصيل.» Remove «يتحمل العميل تكاليف الشحن».
- Shipping: 24 h only; delete international + tax sections; email → WhatsApp; link /track.
- Privacy: disclose Meta + TikTok pixels.
- Footer/Contact: real Instagram/TikTok (pending from Ali) or hidden. **P0.**
- 404 + search empty state + WhatsApp prefill: Iraqi voice (exact copy in round 2 report R2-10, R2-11, R2-16).

## C11. Checkout

★ Same progressive 4-field form as the PDP (phone first), same order and validation; empty cart → «شوف العطور» button; empty /checkout redirects to cart.

## C12. SEO basics

★ Canonical on every page; Arabic meta description generated from page data (product: price + COD line; category: count + top 3 names).

---

## Order of work (if approved)

1. Quick, no-design: C10 copy, C8 contrast, C9 stat, C12 SEO. (S)
2. C1 gallery + trust line, C7 fonts/icons. (M)
3. C5 track, C3 lists, C6 menu, C11 checkout. (M)
4. C2 notify-me (DB + platform list), C4 content standard. (M-L)

Each step: type-check + lint, vitest, Playwright at 390px, axe, before/after screenshots, re-score.
