"use client";

import { useCallback } from "react";

interface NewsletterEditorProps {
    data: Record<string, unknown>;
    onUpdate: (data: Record<string, unknown>) => void;
}

export function NewsletterEditor({ data, onUpdate }: NewsletterEditorProps) {
    const title = (data.title as string) || "";
    const description = (data.description as string) || "";
    const buttonText = (data.button_text as string) || "";
    const placeholderText = (data.placeholder_text as string) || "";

    const update = useCallback(
        (field: string, value: string) => {
            onUpdate({ ...data, [field]: value });
        },
        [data, onUpdate]
    );

    return (
        <div className="space-y-3">
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Title
                </label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => update("title", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="اشترك في نشرتنا البريدية"
                    dir="auto"
                />
            </div>
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Description
                </label>
                <textarea
                    value={description}
                    onChange={(e) => update("description", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="احصل على آخر العروض والمنتجات الجديدة"
                    dir="auto"
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Button Text
                    </label>
                    <input
                        type="text"
                        value={buttonText}
                        onChange={(e) => update("button_text", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="اشتراك"
                        dir="auto"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Placeholder
                    </label>
                    <input
                        type="text"
                        value={placeholderText}
                        onChange={(e) => update("placeholder_text", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="بريدك الإلكتروني"
                        dir="auto"
                    />
                </div>
            </div>
        </div>
    );
}
