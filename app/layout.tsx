import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Schenider | Intelly Dashboard",
  description: "Advanced medical dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-pastel-yellow selection:text-black`}
      >
        <div className="flex min-h-screen bg-background text-foreground">
          {/* Sidebar Component */}
          <Sidebar />

          {/* Main Content Area */}
          {/* 64 = sidebar width (16rem/256px) + margins. roughly 300px spacer */}
          <main className="flex-1 ml-[calc(16rem+2rem)] p-4 min-w-0">
            <div className="max-w-[1200px] mx-auto pt-6 pb-20">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
