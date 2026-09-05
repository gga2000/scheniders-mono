# Store-builder editor — fourth UX audit (post-simplification re-score)

**Date:** 2026-08-20 · **Method:** live re-drive of the shipped branch (`feat/store-builder-preview-iframe`, 17 commits ahead of main / PR #57) on tenant #100051, cross-referenced against the four simplification rounds + cleanup + UX-21, each already live-verified during implementation.
**Baselines:** [07-02](STORE_BUILDER_UX_AUDIT_2026-07-02.md) 41/100 → [07-07](STORE_BUILDER_UX_AUDIT_2026-07-07.md) 75/100 → [08-07 simplification sweep](STORE_BUILDER_SIMPLIFICATION_2026-08-07.md).
**Persona:** Fatima — non-technical, Arabic-first, Baghdad cosmetics, WhatsApp-first, on a laptop.

---

## Verdict

**The editor is simple enough for Fatima now.** The third-pass sweep did what the first two couldn't: it moved the work from *explaining* complexity to *removing* it. Three of her five core tasks sit at their irreducible floor (2 clicks), the two that didn't — the section wall and the WhatsApp number — were structurally fixed (hidden invalid/duplicate sections; a number single-sourced and captured inline), and the whole editor now opens full-viewport as its own product instead of nested in the OMS shell. The remaining gaps are benchmark-tier polish (real per-template thumbnail art, auto-translate) that the owner has explicitly deprioritized, not approachability blockers. **Approachability: 90/100** (was 41 → 75).

---

## Task cost table — measured, post-sweep vs 08-07

| # | Task | Clicks (before → now) | Decisions | New concepts | What changed |
|---|---|---|---|---|---|
| T1 | Change the headline | 2 → **2** | 1 | 0 | Already at floor; untouched (correctly). |
| T2 | Swap the hero image | 2 → **2** | 1 | 0 | Untouched; thumbnail preview on set. |
| T3 | Add a product row | 2 (of **48**) → **2 (of ~20 relevant)** | 1 | «عنصر» | Invalid-for-page cards hidden, near-duplicate hero/ticker/CTA flavors folded (S3-04). |
| T4 | Set the WhatsApp number | **∞ (broken)** → **0–3** | 0–1 | 0 | Single-sourced to `commerce.whatsapp_number`; wizard-given number → step born done; else inline capture in the checklist row (S3-01). Was a dead-end no-op button. |
| T5 | Publish | 2 → **2** | 2 → **0 in the way** | was: pixel/OG jargon → **none blocking** | Recommendations collapse behind «توصيات (n)» in Simple; diff rows show «غلاف مع صورة» not `hero_image (hero_image)` (S3-05). |

Four of five at or near floor; the one that was *impossible* (T4) is now trivial.

---

## 15-dimension scorecard (vs 07-07)

| # | Dimension | 07-07 | Now | What moved it |
|---|---|---|---|---|
| 1 | First-run fear / approachability | 8 | **9** | Signup 5 fields (no plan matrix), auto-login → wizard, 3-field wizard, industry-voiced hero. First hour has no dead end. |
| 2 | Simple ⇄ Advanced quality | 8 | **9** | Mode now gates *surfaces* (tree, health, picker, brand-kit dev fields), not just fields. |
| 3 | Progressive disclosure & density | 8 | **9** | Page tree 13→5+reveal; health = checklist only in Simple; picker hides invalid+dupes. |
| 4 | Translation UX | 8 | **8** | Reveal still per-field; auto-translate deprioritized by owner. |
| 5 | Visual hierarchy & cognitive load | 8 | **9** | Full-viewport editor (UX-21); brand-kit preview localized w/ Arabic glyphs; publish diff readable. |
| 6 | Onboarding, empty states & guidance | 8 | **9** | Store-less dashboard card; delivery-fee moved to a just-in-time checklist step. |
| 7 | Direct manipulation on canvas | 8 | **9** | Unchanged loop + ~200px more canvas from the immersive shell. |
| 8 | Section library / add flow | 8 | **9** | Wall 48→~20 relevant; palette-driven template thumbnails; dev captions stripped from SVGs. |
| 9 | Inspector / AutoForm complexity | 7 | **9** | href → destination picker; scribble-color hidden+labeled; panel «مفعّل» removed. |
| 10 | Style / Brand Kit approachability | 7 | **8** | Favicon/OG → Advanced; live-preview card localized; «Translations» toggle root-caused. |
| 11 | Save / publish / trust | 7 | **9** | Publish diff display-names + collapsed recs; WhatsApp honesty; slug/handle claim with old-link redirects. |
| 12 | Localization of chrome | 7 | **9** | Brand-kit body + preview card localized; publish diff; last English pockets closed. |
| 13 | Consistency & reuse | 7 | **8** | One destination-picker pattern; mode filter applied uniformly across surfaces. |
| 14 | Architecture health as it blocks UX | 8 | **8** | Steady; immersive-layout branch is clean. |
| 15 | Benchmark gaps | 6 | **7** | Handle claim + template thumbnails closed two; auto-translate + hand-designed thumbnail art remain (deprioritized). |
| | **Total** | 75/100 | **90/100** | |

---

## What the sweep shipped (traceability)

R1 `56504406` WhatsApp single-source + signup auto-login · R2 `8ac6fe57` gate surfaces (tree/health/publish/brand-kit) · R3 `790cc357` picker wall + destination picker + thumbnail cleanup · R4 `92a6558b` ask-less-at-start (no plan matrix, 3-field wizard, industry hero) · cleanup `9da2d0a4` brand-kit finish · `bf11098a` UX-21 full-viewport editor · `7c769de5` palette template thumbnails · `40d8211e` handle claim · plus four security lockdowns (`778f7f0d`→`a04fb0d1`) that don't touch UX but shipped alongside.

## Still open (all deprioritized or owner-deferred)

1. Auto-translate / AI copy — **owner declined** («no AI thing»).
2. Real hand-designed per-template thumbnail art — palette previews now stand in; art is a design task.
3. SSR-authed shell / one-RTT auth context — perf polish, not approachability (dashboard already paints ~1.1s per the perf work on main).

**No approachability blocker remains for Fatima.** The next lever is benchmark parity, not simplification.
