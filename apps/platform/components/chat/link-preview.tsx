// apps/platform/components/chat/link-preview.tsx
"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useUnfurl } from "@/hooks/chat/use-unfurl";

/** Best-effort host label for the preview footer; null if the URL won't parse. */
function hostOf(url: string): string | null {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

/**
 * Compact link-preview card rendered under a message body. Fetches OG/twitter
 * metadata via the SSRF-guarded unfurl route and shows an image thumb + title
 * + clamped description + host. Renders nothing until there's at least a title
 * or an image (so blocked/failed unfurls stay invisible).
 *
 * Links out in a new tab with `rel="noopener noreferrer"`.
 */
export function LinkPreview({ url }: { url: string }) {
    const { t } = useLanguage();
    const { data } = useUnfurl(url);

    if (!data) return null;
    const hasContent = !!data.title || !!data.image;
    if (!hasContent) return null;

    const host = hostOf(data.url);

    return (
        <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={data.title ?? t("chat.linkPreview.open", "Open link")}
            className="group mt-2 flex w-full max-w-[420px] overflow-hidden rounded-xl border border-(--card-border) bg-(--card-bg) text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
        >
            {data.image && (
                // eslint-disable-next-line @next/next/no-img-element -- remote OG image, not a static asset
                <img
                    src={data.image}
                    alt=""
                    className="h-[72px] w-[72px] shrink-0 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                />
            )}
            <div className="min-w-0 flex-1 px-3 py-2">
                {data.title && (
                    <div className="line-clamp-1 text-[13px] font-semibold text-foreground">
                        {data.title}
                    </div>
                )}
                {data.description && (
                    <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
                        {data.description}
                    </div>
                )}
                {host && (
                    <div className="mt-1 truncate text-[10.5px] uppercase tracking-wide text-muted-foreground/80">
                        {host}
                    </div>
                )}
            </div>
        </a>
    );
}
