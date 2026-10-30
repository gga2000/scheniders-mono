# Merchant MCP connector: design

Status: draft for Ali's review · 2026-10-30

## Goal

A merchant adds "Scheniders" as a connector in Claude (claude.ai, Claude Desktop or Claude Code), signs in with their normal Scheniders account, and can then ask questions about **their own store**, for example "which orders are stuck in delivery in Basra this week?", "how many orders did we deliver yesterday and for how much?" or "is 0770… a good customer?".

Version 1 is **read-only**. Writes (order status, stock) come in a later version, each confirmed by the merchant and written to the activity log.

## Non-negotiables

1. **Tenant isolation.** Every tool acts as the signed-in user, in their membership-verified active store. A tool never accepts a tenant id from Claude.
2. **Role and permission respected.** A `viewer` sees what a viewer sees in the app. Money figures need the same permission the Finances page needs (`has_tenant_permission`).
3. **Read-only is enforced by the database, not only by the tool list.** The OAuth token Claude holds is a real Supabase user JWT, so it could also be sent straight to the Supabase REST API. The database must refuse writes from it (see "Read-only token" below).
4. **Every tool call is logged** with user, store, OAuth client and tool name.

## Architecture

```
Claude ──(OAuth 2.1 + PKCE, dynamic client registration)──> Supabase Auth OAuth server
   │                                                           │ redirects to
   │                                                           ▼
   │                                       platform /oauth/consent  (sign in → approve/deny)
   │
   └──(Bearer: Supabase access token, carries client_id)──> platform /api/mcp  (Streamable HTTP)
                                                            │ verify token → resolveActiveTenant
                                                            ▼
                                                 Supabase as the user (RLS applies)
```

**Units:**

| Unit | Location | Job |
|---|---|---|
| OAuth server | Supabase dashboard (Auth → OAuth Server) | Issues tokens. Ali enables it, sets the authorization path to `/oauth/consent` and turns on dynamic client registration. |
| Consent page | `apps/platform/app/oauth/consent/` | Signs the user in (reuses login `returnTo`), shows the client name, the store and a plain list of what it can read, then Approve or Deny. Arabic and English, LTR. |
| Protected-resource metadata | `apps/platform/app/.well-known/oauth-protected-resource/route.ts` | Tells Claude which authorization server to use. |
| MCP endpoint | `apps/platform/app/api/mcp/route.ts` | Streamable HTTP via `mcp-handler` and `@modelcontextprotocol/sdk`. Verifies the bearer token, resolves the caller with the existing `resolveActiveTenant`, then dispatches to tools. Middleware does not run on `/api`, so the route authenticates itself. |
| Tools | `apps/platform/lib/mcp/tools/*.ts` | One file per tool. Each has a Zod input schema, a user-scoped Supabase client and a pure formatter. Tools are unit-tested on their own. |
| Call log | `activity_logs` via `lib/activity-logger.ts` | Records one row per tool call. |
| Read-only token guard | new migration | See below. |

## Tools in v1 (read-only)

| Tool | Returns |
|---|---|
| `get_store` | Store name, slug, the caller's role, today's date in Baghdad time. |
| `search_orders` | Orders filtered by term (number, phone, name), status, governorate, date range and channel. Limit 50. Reuses `search_orders_v2` and the orders list filters. |
| `get_order` | One order: items, totals in IQD, customer, address, delivery company and tracking, and status history. |
| `find_customer` | Customer by phone (normalized, so 07… and +9647… match) or name, with order count, delivered/returned rate and trust flag. |
| `list_products` | Products and variants with stock, price in IQD and a `low_stock` filter. Sold counts use the delivered-only rule. |
| `sales_summary` | Counts by status and delivered revenue for a date range, built on the same queries as the dashboard. Money needs the finance permission. |

All money is whole IQD. There is no tax logic. Phone numbers are shown in full only to roles that see them in the app.

## Read-only token guard

Supabase OAuth access tokens carry a `client_id` claim; the app's own session tokens do not. A PostgREST `db_pre_request` function (none exists today) checks `request.jwt.claims ->> 'client_id'`. When it is present:

- `GET` and `HEAD` are allowed (RLS still applies).
- `POST /rpc/<fn>` is allowed only for an allowlist of read functions the tools use.
- Everything else (`POST`, `PATCH`, `DELETE` and other RPCs) raises `42501`.

A restrictive policy on `storage.objects` also blocks insert, update and delete for tokens with `client_id`. Version 2 replaces the blanket block with specific write tools that go through the existing guarded server code, not direct table writes.

## Error handling

- A missing or invalid token returns 401 with `WWW-Authenticate` pointing at the resource metadata, so Claude re-runs sign-in.
- A deactivated user, no active store or a missing permission returns a tool error with a plain sentence, never a stack trace.
- Supabase errors are reported to Sentry and returned as a generic message.

## Testing

- Vitest for each tool: input validation, formatting and permission gating.
- A tenant-isolation test: a token for store A that asks for an order id from store B gets "not found".
- A migration test on a branch: an OAuth-style JWT is refused on insert, update and delete and on a non-allowlisted RPC, and allowed on select.
- Live: Ali adds the connector in claude.ai, signs in to `scheniders-iraq` and runs each tool. Then Ali checks the activity log rows.

## Dashboard steps for Ali (one time)

1. Supabase → Authentication → OAuth Server: enable it, set the authorization path to `/oauth/consent` and enable dynamic client registration.
2. Check that Authentication → URL Configuration → Site URL is the platform app's production domain, because the consent page lives there.

## Out of scope for v1

Writes, the storefront app, the internal admin app, cross-store questions, and a screen in Settings for revoking access (users can revoke from Claude for now; a Settings screen is in v2).
