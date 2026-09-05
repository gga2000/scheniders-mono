# Out-of-scope findings — surfaced 2026-09-02 during the Dashboard audit's R1

These were found by `/code-review high` while reviewing the **Dashboard R1 (SEC-D1)** diff. **None of them are dashboard findings and none were touched** — scope discipline (audit prompt §10). They belong to commit `165476f2` ("honest numbers", merged as PR #63) and to other pre-existing uncommitted work.

Logged here so they are not lost. Each needs its own owner and approval before any change.

| ID | Severity | Location | Finding |
|---|:--:|---|---|
| OOS-1 | **P1** | `packages/sections/src/pdp_direct_order.tsx:494` | `props.trust_chips ?? []` drops trust chips on every **already-published** PDP. `resolveSection` uses only `instance.base`; `defaultProps` is never merged at render time, so the live signature store's PDP loses the whole chip row after deploy. Fall back to `defaultProps.trust_chips`. |
| OOS-2 | **P1** | `apps/storefront/app/api/newsletter/route.ts:74` | New **unauthenticated service-role write endpoint** with no rate limit. `tenant_id` is public in the page HTML, so subscriber rows can be inserted without bound. |
| OOS-3 | P2 | `apps/storefront/lib/queries.ts:48` | `withReviewStats` counts rows client-side with no explicit range — a PostgREST max-rows cap would silently under-report `review_count` / `avg_rating`. This is the exact failure class the "honest numbers" commit set out to fix. Aggregate in Postgres. |
| OOS-4 | P2 | `apps/platform/components/orders/reason-list-editor.tsx:351` | Popover switched to `position: fixed` with coordinates snapshotted once at open, inside a `max-h-[55vh] overflow-y-auto` container (`cancellation-reason-dialog.tsx:233`). Scrolling or resizing strands it away from its trigger. (Uncommitted work, predates this engagement.) |
| OOS-5 | P2 | `vitest.workspace.ts` | `packages/sections` is missing from the workspace, so its tests report "No test files found" from the repo root and never run. CI runs no tests at all (project policy), so nothing catches this. |
| OOS-6 | P3 | `packages/sections/src/site_footer.tsx:444` | Comment claims the tenant setting wins over a stale per-section override, but `resolveTenantPhone` (`whatsapp.ts:125`) returns the override first. Comment or precedence is wrong. |
| OOS-7 | P3 | `apps/platform/publish-signature-draft.ts` | Loose scratch file at an app root — banned by the project file-hygiene rule. Untracked; keep it out of any `git add -A`. |

**Note on OOS-5:** the Dashboard audit's own test evidence (`vitest 676/676`) was gathered with `--filter @scheniders/platform`, so it is unaffected by this gap — but a repo-root `vitest run` does not exercise `packages/sections`.
