"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { queryClient } from "@/lib/query-client";
import { AdminAuthProvider } from "@/hooks/use-admin-auth";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AdminAuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AdminAuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
