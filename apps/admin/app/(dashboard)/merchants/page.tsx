import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { MerchantsView } from "@/components/merchants/merchants-view";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { adminFromCookies } from "@/lib/api-auth";
import { readMerchantsList } from "@/lib/merchants-list";
import {
  MERCHANTS_PAGE_SIZE,
  NO_MERCHANT_FILTERS,
  merchantSortParam,
  merchantsListKey,
  merchantsListParams,
  merchantsStatsKey,
  merchantsStatsParams,
} from "@/lib/merchants-query";
import { readMerchantsStats } from "@/lib/merchants-stats";
import { stampRead } from "@/lib/page-read-at";
import { getQueryClient } from "@/lib/query-client";
import { SIGNED_OUT } from "@/lib/staff-sign-in";

/**
 * The read only for signed-in staff, and an unreadable query value is a failed
 * read. Each read checks on its own, inside its query: a check that fails is
 * then that read's failure, left out of the page like any other.
 */
async function staffRead<T extends object>(read: () => Promise<T | { badRequest: string }>): Promise<T> {
  if (!(await adminFromCookies())) throw new AdminAuthError(401, SIGNED_OUT);
  const answer = await read();
  if ("badRequest" in answer) throw new Error(answer.badRequest);
  return answer;
}

/**
 * Merchants reads its first page of shops and their numbers on the server and
 * arrives with them in, for the view it opens with (no filter, newest first):
 * before, the page came first, then its JS, then two reads from the browser.
 * Same reads and same staff check as /api/merchants and /api/merchants/stats.
 * A read that fails is left out, and the browser asks the route as before; a
 * filter the browser starts with simply reads its own shops, as it did.
 */
export default async function MerchantsPage() {
  const queryClient = getQueryClient();
  const sortParam = merchantSortParam([]);
  await Promise.all([
    queryClient.prefetchInfiniteQuery({
      queryKey: merchantsListKey(NO_MERCHANT_FILTERS, MERCHANTS_PAGE_SIZE, sortParam),
      queryFn: async () =>
        stampRead(
          await staffRead(() =>
            readMerchantsList(merchantsListParams(NO_MERCHANT_FILTERS, 1, MERCHANTS_PAGE_SIZE, sortParam)),
          ),
        ),
      initialPageParam: 1,
      retry: false,
    }),
    queryClient.prefetchQuery({
      queryKey: merchantsStatsKey(NO_MERCHANT_FILTERS),
      queryFn: () => staffRead(() => readMerchantsStats(merchantsStatsParams(NO_MERCHANT_FILTERS))),
      retry: false,
    }),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MerchantsView />
    </HydrationBoundary>
  );
}
