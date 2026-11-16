/**
 * Where a store lives on the web (Fermi A4): `<slug>.usefermi.com`.
 *
 * The platform builds store links from its NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN
 * and the storefront routes by its NEXT_PUBLIC_ROOT_DOMAIN; both fall back to
 * this one value, as does the staff console, which has no setting of its own.
 * Stores used to live under scheniders.com (the perfume store's own domain);
 * those addresses now move to the same path here.
 */
export const STORE_ROOT_DOMAIN = "usefermi.com";

/** `<slug>.<root>`: the address a store's subdomain link shows. */
export function storeAddress(slug: string, root: string = STORE_ROOT_DOMAIN): string {
    return `${slug}.${root}`;
}
