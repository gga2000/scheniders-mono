// apps/platform/hooks/use-page-tab-title.ts
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { setTabTitlePart } from "@/lib/tab-title";

/**
 * The page's name for the tab: the sidebar label of its first path segment
 * ("/finances/new" → "nav.finances"), or "" for a page the sidebar does not
 * name. `t` returns the key itself when it has no translation.
 */
export function pageTabTitle(pathname: string | null, t: (key: string) => string): string {
    const segment = pathname?.split("/")[1];
    if (!segment) return "";
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
