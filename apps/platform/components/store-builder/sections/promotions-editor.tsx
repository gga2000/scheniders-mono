"use client";

import { useCallback } from "react";

interface PromotionsEditorProps {
    data: Record<string, unknown>;
    onUpdate: (data: Record<string, unknown>) => void;
}

export function PromotionsEditor({ data, onUpdate }: PromotionsEditorProps) {
    const text = (data.text as string) || "";
    const bgColor = (data.background_color as string) || "#3b82f6";
    const linkUrl = (data.link_url as string) || "";
    const countdownEnd = (data.countdown_end as string) || "";

    const update = useCallback(
        (field: string, value: string | null) => {
            onUpdate({ ...data, [field]: value });
        },
        [data, onUpdate]
    );

    return (
        <div className="space-y-3">
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Banner Text
                </label>
                <input
                    type="text"
                    value={text}
                    onChange={(e) => update("text", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="خصم 20% على جميع المنتجات!"
                    dir="auto"
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Background Color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={bgColor}
                            onChange={(e) => update("background_color", e.target.value)}
                            className="w-8 h-8 rounded-lg border border-(--card-border) cursor-pointer p-0.5"
                        />
                        <input
                            type="text"
                            value={bgColor}
                            onChange={(e) => {
                                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                                    update("background_color", e.target.value);
                                }
                            }}
                            className="flex-1 px-3 py-2 rounded-xl border border-(--card-border) bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Link URL
                    </label>
                    <input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => update("link_url", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="https://..."
                        dir="ltr"
                    />
                </div>
            </div>
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Countdown End (optional)
                </label>
                <input
                    type="datetime-local"
                    value={countdownEnd}
                    onChange={(e) => update("countdown_end", e.target.value || null)}
                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                    Leave empty for no countdown timer.
                </p>
            </div>
        </div>
    );
}
