"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { StoreLink } from "@/lib/store-context";
import type { Tenant, Category } from "@/lib/types";
import { CartButton } from "./CartButton";

interface Props {
  tenant: Tenant;
  categories?: Category[];
  variant?: "default" | "minimal" | "elegant";
}

export function StoreHeader({ tenant, categories = [], variant = "default" }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const showNav = variant !== "minimal" && categories.length > 0;

  return (
    <header className="sticky top-0 z-40 w-full bg-bk-surface-alt/80 backdrop-blur-md border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            {showNav && (
              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden p-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
            <StoreLink href="/" className="flex items-center gap-3">
              {tenant.branding?.logo_url ? (
                <Image
                  src={tenant.branding.logo_url}
                  alt={tenant.business_name}
                  width={40}
                  height={40}
                  className="object-contain rounded"
                  unoptimized
                />
              ) : (
                <div className="w-10 h-10 rounded bg-brand-primary flex items-center justify-center text-white font-bold">
                  {tenant.business_name.charAt(0)}
                </div>
              )}
              <span className="font-bold text-lg text-zinc-900 hidden sm:inline">
                {tenant.business_name}
              </span>
            </StoreLink>
          </div>

          {showNav && (
            <nav className="hidden md:flex items-center gap-6">
              <StoreLink href="/" className="text-zinc-700 hover:text-brand-primary transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
                الرئيسية
              </StoreLink>
              {categories.slice(0, 5).map((cat) => (
                <StoreLink
                  key={cat.id}
                  href={`/categories/${cat.slug}`}
                  className="text-zinc-700 hover:text-brand-primary transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  {cat.name}
                </StoreLink>
              ))}
            </nav>
          )}

          <CartButton />
        </div>
      </div>

      {/* Mobile nav drawer */}
      {showNav && mobileOpen && (
        <div className="md:hidden border-t border-zinc-200 bg-bk-surface-alt">
          <nav className="max-w-7xl mx-auto px-4 py-3 space-y-1">
            <StoreLink
              href="/"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-lg text-zinc-700 hover:bg-zinc-100 hover:text-brand-primary transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              الرئيسية
            </StoreLink>
            {categories.slice(0, 8).map((cat) => (
              <StoreLink
                key={cat.id}
                href={`/categories/${cat.slug}`}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg text-zinc-700 hover:bg-zinc-100 hover:text-brand-primary transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                {cat.name}
              </StoreLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
