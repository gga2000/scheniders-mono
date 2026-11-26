import type { ReactNode } from "react";
import { Eye } from "lucide-react";

/**
 * A Settings screen with the "what your customer sees" column on its right:
 * the controls on the left, a live preview that follows every change.
 */
export function SettingsWithPreview({ preview, children }: { preview: ReactNode; children: ReactNode }) {
    return (
        <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1 space-y-4">{children}</div>
            {preview}
        </div>
    );
}

/** The preview column: who sees it, then the drawing, then where its data comes from. */
export function SettingsPreviewPane({
    title,
    hint,
    caption,
    children,
}: {
    title: string;
    /** e.g. "changes as you type". */
    hint?: string;
    /** Under the drawing, e.g. "sample order, not a real one". */
    caption?: ReactNode;
    children: ReactNode;
}) {
    return (
        <aside aria-label={title} className="pastel-card sticky top-0 w-80 shrink-0 self-start p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <bdi>{title}</bdi>
                </p>
                {hint && <span className="text-[11px] text-muted-foreground"><bdi>{hint}</bdi></span>}
            </div>
            {children}
            {caption && <p className="mt-3 text-xs text-muted-foreground"><bdi>{caption}</bdi></p>}
        </aside>
    );
}
