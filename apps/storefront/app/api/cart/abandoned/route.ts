import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Abandoned-cart capture is switched off (PLAN.md §4 step 1c, PKG-12 interim).
//
// The old handler upserted abandoned_carts with the service role for any
// tenant_id and phone an anonymous caller sent, so anyone could write recovery
// rows (and later WhatsApp nudges) for any store and any number. Keeping a
// tenant's recovery toggle off did not stop those writes. Until PKG-12 binds
// capture to a server-side checkout session, this endpoint accepts nothing and
// touches no database.
//
// The storefront still beacons here (checkout_form, pdp_direct_order). Those
// calls are fire-and-forget fetches that never read the response, and a 410 is
// a resolved fetch, not a rejection, so shoppers see no change.
export function POST(): NextResponse {
  return NextResponse.json(
    { error: "Abandoned-cart capture is disabled" },
    { status: 410 },
  );
}
