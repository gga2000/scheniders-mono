import type { Metadata, Viewport } from "next";
import { geistFontVars } from "./fonts/geist";
import "./globals.css";
// Fail-fast: validate all environment variables at app startup
import "@/lib/env";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ChatRuntime } from "@/components/chat/chat-runtime";
import { PWAProvider } from "@/components/pwa/pwa-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { NewOrderAlerts } from "@/components/orders/new-order-alerts";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-provider";
import { RoleProvider } from "@/components/providers/role-provider";
import { FinancialVisibilityProvider } from "@/components/providers/financial-visibility-provider";
import { DevServiceWorkerCleanup } from "@/components/pwa/dev-service-worker-cleanup";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@scheniders/ui/error-boundary";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "شنايدر",
  description: "نظام إدارة الطلبات - Advanced order management dashboard for Schenider team",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Schenider OMS",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  return (
    <html lang="ar" suppressHydrationWarning>
      <head>
        {/* Preconnect to the Supabase origin so DNS + TLS overlap with JS parse
            on cold loads — the first request (auth/orders/metrics) fires immediately. */}
        <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={supabaseOrigin} />
        {/* PWA Meta Tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Schenider" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <link rel="apple-touch-startup-image" href="/icons/splash.png" />
      </head>
      <body
        style={geistFontVars}
        className="antialiased selection:bg-pastel-yellow selection:text-black"
      >
        <ErrorBoundary name="Root">
          <AuthProvider>
            <QueryProvider>
              {/* The order book is NOT mounted here: the routes that show orders
                  mount <OrdersProvider> in their own layouts. Only the
                  new-order alert stays app-wide. */}
              <NewOrderAlerts />
              <PWAProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="light"
                  enableSystem
                  enableColorScheme
                  disableTransitionOnChange
                >
                  <RoleProvider>
                    <FinancialVisibilityProvider>
                      <LanguageProvider>
                        <DashboardLayout>
                          {children}
                          <ChatRuntime />
                        </DashboardLayout>
                      </LanguageProvider>
                    </FinancialVisibilityProvider>
                  </RoleProvider>
                </ThemeProvider>
              </PWAProvider>
            </QueryProvider>
          </AuthProvider>
        </ErrorBoundary>
        <Toaster />
        <SpeedInsights />
        <DevServiceWorkerCleanup />
      </body>
    </html>
  );
}
