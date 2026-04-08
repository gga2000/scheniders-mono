"use client";

import { createContext, useContext } from "react";
import Link from "next/link";

/**
 * Provides the URL prefix for store-internal links.
 *
 * - Subdomain mode (proxy rewrite):  base = ""        → links are "/cart"
 * - Path-based mode (direct access): base = "/s/acme" → links are "/s/acme/cart"
 */
const StoreBaseContext = createContext("");

export function StoreBaseProvider({
  base,
  children,
}: {
  base: string;
  children: React.ReactNode;
}) {
  return (
    <StoreBaseContext.Provider value={base}>
      {children}
    </StoreBaseContext.Provider>
  );
}

/** Returns the store base path ("" for subdomain, "/s/slug" for path-based). */
export function useStoreBase() {
  return useContext(StoreBaseContext);
}

/** Drop-in replacement for next/link that prepends the store base path. */
export function StoreLink({
  href,
  ...props
}: React.ComponentProps<typeof Link>) {
  const base = useStoreBase();
  const resolvedHref =
    typeof href === "string" && href.startsWith("/")
      ? `${base}${href}`
      : href;
  return <Link href={resolvedHref} {...props} />;
}
