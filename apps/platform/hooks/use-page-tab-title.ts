// apps/platform/hooks/use-page-tab-title.ts
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { setTabTitlePart } from "@/lib/tab-title";

/**
 * The page's name for the tab: the sidebar label of its first path segment
 * ("/orders/x" → "nav.orders"), or "" for a page the sidebar does not
 * name. `t` returns the key itself when it has no translation.
 */
export function pageTabTitle(pathname: string | null, t: (key: string) => string): string {
    const [, segment, sub] = pathname?.split("/") ?? [];
    if (!segment) return "";
    // The old finance page keeps its own name, so its tab is not mistaken for the Finances page.
    if (segment === "finances" && sub === "advanced") return t("finances.header.title");
    const key = `nav.${segment}`;
    const label = t(key);
    return label === key ? "" : label;
}

/** Names the current page in the tab title, in the merchant's language. */
export function usePageTabTitle(): void {
    const pathname = usePathname();
    const { t } = useLanguage();
    const title = pageTabTitle(pathname, t);
    useEffect(() => {
        setTabTitlePart("page", title);
    }, [title]);
}
