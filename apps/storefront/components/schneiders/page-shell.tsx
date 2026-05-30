"use client";

import type { ReactNode } from "react";
import type { Tenant, Category } from "@/lib/types";
import { SchneidersHeader } from "./header";
import { SchneidersFooter } from "./footer";
import { StickyBottomBar } from "./bottom-bar";

interface Props {
  tenant: Tenant;
  categories?: Category[];
  cartCount?: number;
  showBack?: boolean;
  promo?: string | null;
  /** Hide the sticky bottom bar (e.g. checkout pages). */
  hideBottomBar?: boolean;
  /** Override the bottom bar entirely. */
  bottomBar?: ReactNode;
  /** Content slot. Always rendered inside the standard max-w-md mobile container. */
  children: ReactNode;
  /** Hide the footer (useful for full-bleed pages like checkout). */
  hideFooter?: boolean;
}

export function SchneidersPageShell({
  tenant,
  categories = [],
  cartCount = 0,
  showBack = false,
  promo,
  hideBottomBar,
  bottomBar,
  children,
  hideFooter,
}: Props) {
  const wa = tenant.store_config?.contact?.whatsapp_number ?? tenant.contact_phone ?? null;
  return (
    <div className="min-h-screen bg-candy-cream text-candy-ink font-body">
      <SchneidersHeader
        tenant={tenant}
        categories={categories}
        cartCount={cartCount}
        showBack={showBack}
        promo={promo}
      />

      <main className="max-w-md mx-auto px-4 pt-6 pb-32 space-y-8">{children}</main>

      {!hideFooter && <SchneidersFooter tenant={tenant} />}

      {!hideBottomBar && (bottomBar ?? <StickyBottomBar whatsapp={wa} phone={tenant.contact_phone} />)}
    </div>
  );
}
