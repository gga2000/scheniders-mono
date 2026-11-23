import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { CommandCenter } from "@/components/dashboard/command-center";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { createAdminClient } from "@/lib/admin-supabase";
import { adminFromCookies } from "@/lib/api-auth";
import { readDashboardV2 } from "@/lib/dashboard-v2";
import { DASHBOARD_V2_KEY } from "@/lib/dashboard-v2-key";
import { getQueryClient } from "@/lib/query-client";
import { SIGNED_OUT } from "@/lib/staff-sign-in";

/**
 * Home reads its numbers on the server and arrives with them in: before, the
 * page came first, then its JS, then the browser asked /api/dashboard/v2 (one
 * more trip before staff saw a number). Same read, same staff check as that
 * route. A read that fails here is left out of the page, and the browser asks
 * the route as before, so its failure shows the usual way.
 */
export default async function HomePage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: DASHBOARD_V2_KEY,
    queryFn: async () => {
      if (!(await adminFromCookies())) throw new AdminAuthError(401, SIGNED_OUT);
      return readDashboardV2(createAdminClient());
    },
    retry: false,
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CommandCenter />
    </HydrationBoundary>
  );
}
