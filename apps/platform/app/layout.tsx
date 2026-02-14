import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PWAProvider } from "@/components/pwa/pwa-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { OrdersProvider } from "@/components/providers/orders-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DevServiceWorkerCleanup } from "@/components/pwa/dev-service-worker-cleanup";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Schenider | Order Management System",
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
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Schenider" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <link rel="apple-touch-startup-image" href="/icons/splash.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-pastel-yellow selection:text-black`}
      >
        <AuthProvider>
          <QueryProvider>
            <OrdersProvider>
              <PWAProvider>
                <ThemeProvider
                  attribute="data-theme"
                  defaultTheme="system"
                  enableSystem
                  disableTransitionOnChange
                >
                  <DashboardLayout>
                    {children}
                  </DashboardLayout>
                </ThemeProvider>
              </PWAProvider>
            </OrdersProvider>
          </QueryProvider>
        </AuthProvider>
        <SpeedInsights />
        <DevServiceWorkerCleanup />
      </body>
    </html>
  );
}
