"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { getQueryClient } from "@/lib/query-client";
import { AdminAuthProvider } from "@/hooks/use-admin-auth";
import { Toaster } from "sonner";

/** nonce: this answer's script nonce (lib/csp.ts), for the theme's before-paint script. */
export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} nonce={nonce}>
        <AdminAuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AdminAuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
