"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { queryClient } from "@/lib/query-client";
import { AdminAuthProvider } from "@/hooks/use-admin-auth";
import { useAdminRealtime } from "@/hooks/use-admin-realtime";
import { Toaster } from "sonner";

/** Activates Supabase Realtime subscriptions for live dashboard updates. */
function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useAdminRealtime();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AdminAuthProvider>
          <RealtimeProvider>
            {children}
            <Toaster richColors position="top-right" />
          </RealtimeProvider>
        </AdminAuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
