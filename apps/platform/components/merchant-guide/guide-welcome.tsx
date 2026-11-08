"use client";

import { useState } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { lineText, type GuideLocale } from "@/lib/merchant-guide/script";
import { GuideCaption } from "./guide-caption";
import { GuideChoice } from "./guide-choice";
import { GuideSoundButton } from "./guide-sound-button";
import { useGuideVoice } from "./use-guide-voice";
import type { GuideAnswers } from "./use-merchant-guide-data";

type Channel = NonNullable<GuideAnswers["channel"]>;
type Team = "solo" | "staff";

/**
 * First visit: two taps that decide which later phases show (a shop till,
 * a team), then the basics start. What the merchant sells is already asked
 * by the store setup wizard, so it isn't asked again here.
 */
export function GuideWelcome({
    locale,
    soundOn,
    onToggleSound,
    onStart,
    saving,
}: {
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    onStart: (answers: GuideAnswers) => void;
    saving: boolean;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [channel, setChannel] = useState<Channel | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const voice = useGuideVoice("welcome.hello", lineText("welcome.hello", locale), locale, soundOn);
    const ready = channel !== null && team !== null;

    return (
        <div className="fixed inset-0 z-[47] grid place-items-center bg-black/50 p-4" data-testid="merchant-guide-welcome">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-guide-welcome-title"
                className="merchant-guide-card grid w-full max-w-[520px] gap-4 rounded-2xl bg-[var(--card-bg)] p-6 text-foreground shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
            >
                <div className="flex items-center justify-between gap-3">
                    <h2 id="merchant-guide-welcome-title" className="text-lg font-bold">
                        {t("guide.welcome.title")}
                    </h2>
                    <GuideSoundButton soundOn={soundOn} speaking={voice.speaking} onToggle={onToggleSound} tone="light" />
                </div>
                <GuideCaption voice={voice} className="text-[15px] font-semibold" />

                <div className="grid gap-2">
                    <p dir={dir} className="text-left font-semibold">{lineText("welcome.channel", locale)}</p>
                    <GuideChoice<Channel>
                        tone="light"
                        label={lineText("welcome.channel", locale)}
                        value={channel}
                        onChange={setChannel}
                        options={[
                            { id: "online", label: t("guide.welcome.online") },
                            { id: "online_and_shop", label: t("guide.welcome.onlineAndShop") },
                        ]}
                    />
                </div>
                <div className="grid gap-2">
                    <p dir={dir} className="text-left font-semibold">{lineText("welcome.staff", locale)}</p>
                    <GuideChoice<Team>
                        tone="light"
                        label={lineText("welcome.staff", locale)}
                        value={team}
                        onChange={setTeam}
                        options={[
                            { id: "solo", label: t("guide.welcome.justMe") },
                            { id: "staff", label: t("guide.welcome.staff") },
                        ]}
                    />
                </div>

                <p dir={dir} className="text-left text-xs text-muted-foreground">{t("guide.welcome.voiceNote")}</p>

                <button
                    type="button"
                    disabled={!ready || saving}
                    onClick={() => {
                        if (channel && team) onStart({ channel, staff: team === "staff" });
                    }}
                    data-testid="merchant-guide-start"
                    className="h-11 justify-self-start rounded-xl bg-neutral-900 px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                >
                    {t("guide.welcome.start")}
                </button>
            </div>
        </div>
    );
}
