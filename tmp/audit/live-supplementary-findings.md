# Supplementary live-browser findings (beyond the workflow brief)

Captured via Playwright on storefront :3001 /s/scheniders-iraq. To be merged into final report.

## P0 — Mobile navigation completely broken
- The hamburger button `aria-label="القائمة"` exists in site_header but clicking it does NOTHING.
- The only `<nav>` is `class="hidden sm:flex"` (desktop-only, display:none on mobile). No mobile drawer/panel/dialog exists in the DOM or as a body portal (verified: portalCandidates = []).
- `aria-expanded` stays `false` after click. Reachable header links on mobile = ONLY: logo, search, cart. Nav links (الرئيسية / المنتجات / تتبّع الطلب) are UNREACHABLE on mobile.
- Root cause: site_header.tsx renders a hamburger toggle but no mobile menu panel / the open-state renders nothing. Primary traffic is mobile → this is launch-blocking.
- File: packages/sections/src/site_header.tsx

## P1 — No add-to-cart feedback
- Clicking "أضف للسلة" updates localStorage (`scheniders-cart`) + header badge to 1, but there is NO toast / mini-cart drawer / confirmation. No `[role=status]`/`[role=alert]`/toast element appears. User may not realize the item was added. CRO loss.
- Files: pdp_add_to_cart.tsx / cart-signal.tsx / product card.

## P1 — Cart line item full-width sprawl (desktop)
- On desktop the single cart line item stretches the full ~1440px: product info crammed far-left, qty stepper + إزالة crammed far-right, huge empty gap between. Same root cause family as checkout form (max-width:none). Sections bleed to viewport width with no constrained content container.
- Files: cart_line_items.tsx + cart page layout.

## P2 — Backend error renders hard "Store not found" 404
- A transient Supabase tenant-resolution failure (got back an HTML error page) caused the storefront to render "Store not found" (title) + 404 to the customer. Recovered on reload (transient), but the error-handling collapses "backend error" into "tenant doesn't exist." Should distinguish 5xx/timeout (retry/friendly error) from genuine 404.
- Console: `[tenant] resolution error: ... <!DOCTYPE html> ... error-footer`
- File: apps/storefront/lib/tenant.ts (getTenantBySlug) + s/[tenant]/page.tsx notFound() path.

## Confirmed (also in workflow brief), re-verified live:
- Cart: shipping flat 5,000 د.ع under 75k threshold (consistent with free-over-75k marquee). OK.
- Cart/PDP delivery pills: Latin governorate names (BAGHDAD, BASRA, ERBIL, SULAYMANIYAH, NAJAF, KARBALA) — recurring i18n issue across cart + PDP + checkout select.
- Hero broken white-on-white WhatsApp CTA + placeholder number confirmed on mobile too.
- Hero subtitle low contrast over busy photo confirmed on mobile.
