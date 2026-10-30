# Platform MCP connector: design

Status: revised 2026-10-30 after Ali's feedback ("the AI should fully control my store, platform app only, read and write, only for me at first, go live later").

## Goal

Ali adds "Scheniders" as a connector in Claude (claude.ai, Claude Desktop or Claude Code), signs in with his Scheniders account, and Claude can run his store in the platform app: look things up, and change things. Examples include "move every order confirmed yesterday in Basra to shipped", "set stock of the black hoodie L to 12" and "create an order for 0770… with 2× product X to Karbala".

Only users on an access list can connect. At launch that is only Ali. Going live later means adding merchants to the list, or replacing the list with a per-store setting. No code change is needed for that.

Out of scope: the storefront and internal admin apps.

## Non-negotiables

1. **Tenant isolation.** Every call acts as the signed-in user in their membership-verified active store (`resolveActiveTenant`). A tool never accepts a tenant id from Claude. RLS applies to every query because the server talks to Supabase **with the user's own token**, never the service role.
2. **Same rules as the app.** Tools call the same repositories and RPCs the platform UI uses, so validation, triggers, stock moves and order-number rules behave exactly as when Ali clicks in the app. Role and permission checks (`has_tenant_permission`) apply the same way.
3. **Access list enforced in the database.** The OAuth token Claude holds is a real Supabase user JWT that carries a `client_id` claim. A PostgREST `db_pre_request` guard refuses *any* request made with such a token unless the user is on `mcp_access`. Revoking a user takes effect on their next request.
4. **No deletes, no money movement through Claude.** The guard refuses HTTP `DELETE` for OAuth tokens and refuses writes to sensitive tables and RPCs (wallet, billing and subscriptions, team membership, roles and permissions, user profiles). Claude can cancel an order but not delete one.
5. **Every write is audited.** Each tool call writes an `activity_logs` row tagged `source: "claude"` with the user, store, OAuth client, tool, input and result. The order timeline shows "via Claude".
6. **Writes are explicit.** Write tools are marked `destructiveHint` so Claude asks before running them. Bulk tools (more than one order) show a preview first and need a second call with `confirm: true`.

## Architecture

```
Claude ──(OAuth 2.1 + PKCE, dynamic client registration)──> Supabase Auth OAuth server
   │                                                           │ redirects to
   │                                                           ▼
   │                                       platform /oauth/consent  (sign in → approve/deny;
   │                                                                  refuses users not on mcp_access)
   │
   └──(Bearer: user access token with client_id)──> platform /api/mcp  (Streamable HTTP)
                                                    │ verify token → mcp_access check → resolveActiveTenant
                                                    ▼
                                         repositories / RPCs with a Supabase client built
                                         from the user's token (RLS + db_pre_request guard)
```

| Unit | Location | Job |
|---|---|---|
| OAuth server | Supabase dashboard | Ali enables OAuth Server, sets the authorization path `/oauth/consent` and enables dynamic client registration. |
| Consent page | `apps/platform/app/oauth/consent/` | Sign in (login already supports `returnTo`), show the client and store, then Approve or Deny. Users not on the list see "not available yet". |
| Resource metadata | `apps/platform/app/.well-known/oauth-protected-resource/route.ts` | Points Claude at the Supabase authorization server. |
| MCP endpoint | `apps/platform/app/api/mcp/route.ts` | `mcp-handler` with `withMcpAuth`. Builds a per-request context: `{ userId, tenantId, role, clientId, db }`, where `db` is a Supabase client carrying the user's token. |
| Tools | `apps/platform/lib/mcp/tools/<area>.ts` | Zod input, a call into the shared repository or RPC, and a compact text result. One file per area. |
| Shared order logic | `lib/repositories/order-repository.ts` (`buildStatusUpdate`), `lib/orders/status-side-effects.ts`, `lib/inventory-engine.ts` | The status-change pieces the orders page uses now take a Supabase client, so the MCP runs the same code with the user's token. Order creation calls the same `createOrderAction` server action as the New order form. |
| Audit | `lib/mcp/audit.ts` → `activity_logs` | One row per call. |
| DB guard and access list | migration `…_mcp_access_guard.sql` | `mcp_access` table (RLS on, no policies, so it is service-role only) and `public.mcp_request_guard()` set as `pgrst.db_pre_request`. |

## Tools, phase 1 (this PR)

**Read:** `get_store`, `search_orders` (term, status, governorate, date range, channel), `get_order` (items, IQD totals, customer, delivery, history), `find_customer` (normalized phone, history, trust), `list_products` (stock, price, low-stock filter), `sales_summary` (status counts, delivered revenue; money needs the finance permission).

**Write:**
- `update_order_status`: one or many orders; bulk needs a preview and then `confirm`. Uses the app's status path, so stock and history follow.
- `update_order`: customer name, phone, governorate, city, address, notes, delivery price.
- `create_order`: through `create_order_atomic`, with the same plan-limit check as the app.
- `add_order_note`.

## Tools, phase 2 (next PRs, same pattern)

Products (price, visibility, and stock through `adjust_product_stock` / `set_counted_stock` once the Products thread ships them), customers (blacklist, notes), delivery (assign company, Waseet export, print batches), after-sale (refund, replacement), abandoned carts, products (create, images), categories, expenses, store builder text, and chat replies.

## Error handling

- A missing or invalid token returns 401 with `WWW-Authenticate` pointing to the resource metadata, so Claude signs in again.
- If the user is not on the list, the guard rejects the request: 403 with "Claude access is not enabled for this account".
- RLS or permission failures become a plain sentence in the tool result. Unexpected errors go to Sentry and Claude gets a generic message.

## Testing

- Vitest per tool: input validation, permission gating, output format, and the bulk confirm flow.
- Tenant isolation: a token for store A asking for store B's order gets "not found", and a store B update affects 0 rows.
- Guard, run on a Supabase branch or in a transaction with simulated claims: an OAuth claim without access is refused on everything; with access, `DELETE` and the sensitive tables and RPCs are refused while normal writes pass; app session tokens (no `client_id`) are unaffected.
- Live: Ali connects in claude.ai on `scheniders-iraq`, runs each read tool and one safe write (a note on a test order), then checks the activity log.

## Dashboard steps for Ali (one time)

1. Supabase → Authentication → OAuth Server: enable it, set the authorization path to `/oauth/consent` and enable dynamic client registration.
2. Check that Authentication → URL Configuration → Site URL is the platform app's production domain.
