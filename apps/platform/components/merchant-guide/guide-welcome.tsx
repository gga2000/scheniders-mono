"use client";

import { useState } from "react";
import { Compass, Globe, Store, User, Users } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { lineText, type GuideLocale } from "@/lib/merchant-guide/script";
import { GuideTiles } from "./guide-tiles";
import type { GuideAnswers } from "./use-merchant-guide-data";

type Channel = NonNullable<GuideAnswers["channel"]>;
type Team = "solo" | "staff";

/**
 * First visit: two taps that decide which later phases show (a shop till, a
 * team), then start. Only the answers are on the card: each pair of answers
 * says its own question, so the question is kept for screen readers only.
 */
export function GuideWelcome({
    locale,
    onStart,
    saving,
}: {
    locale: GuideLocale;
    onStart: (answers: GuideAnswers) => void;
    saving: boolean;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [channel, setChannel] = useState<Channel | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const ready = channel !== null && team !== null;

    return (
        <div className="fixed inset-0 z-[47] grid place-items-center-safe overflow-y-auto bg-black/50 p-4" data-testid="merchant-guide-welcome">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-guide-welcome-title"
                className="merchant-guide-card grid w-full max-w-[400px] gap-4 rounded-2xl bg-[var(--card-bg)] p-6 text-foreground shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
            >
                <div className="flex items-center gap-3">
                    <span className="merchant-guide-mark" aria-hidden="true">
                        <Compass className="h-5 w-5 text-[#EFFF00]" />
                    </span>
                    <h2 id="merchant-guide-welcome-title" dir={dir} className="text-xl font-bold">
                        {t("guide.welcome.title")}
                    </h2>
                </div>

                <div className="grid gap-2">
                    <GuideTiles<Channel>
                        label={lineText("welcome.channel", locale)}
                        value={channel}
                        onChange={setChannel}
                        options={[
                            { id: "online", label: t("guide.welcome.online"), icon: Globe },
                            { id: "online_and_shop", label: t("guide.welcome.onlineAndShop"), icon: Store },
                        ]}
                    />
                    <GuideTiles<Team>
                        label={lineText("welcome.staff", locale)}
                        value={team}
                        onChange={setTeam}
                        options={[
                            { id: "solo", label: t("guide.welcome.justMe"), icon: User },
                            { id: "staff", label: t("guide.welcome.staff"), icon: Users },
                        ]}
                    />
                </div>

                <button
                    type="button"
                    disabled={!ready || saving}
                    onClick={() => {
                        if (channel && team) onStart({ channel, staff: team === "staff" });
                    }}
                    data-testid="merchant-guide-start"
                    className="h-11 w-full rounded-xl bg-[#EFFF00] px-6 text-sm font-bold text-neutral-900 hover:brightness-95 disabled:bg-neutral-900 disabled:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                >
                    {t("guide.welcome.start")}
                </button>
            </div>
        </div>
    );
}
