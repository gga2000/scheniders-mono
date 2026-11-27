"use client";

import { useState } from "react";
import { Captions, Compass, Globe, Plus, Store, User, Users } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { lineText, type GuideLocale } from "@/lib/merchant-guide/script";
import { welcomePath } from "@/lib/merchant-guide/welcome-path";
import { cn } from "@/lib/utils";
import { GuideCaption } from "./guide-caption";
import { GuideSoundButton } from "./guide-sound-button";
import { GuideTiles } from "./guide-tiles";
import { useGuideVoice } from "./use-guide-voice";
import type { GuideAnswers } from "./use-merchant-guide-data";

type Channel = NonNullable<GuideAnswers["channel"]>;
type Team = "solo" | "staff";

/**
 * First visit: hello by name, two big taps that decide which later phases
 * show (a shop till, a team), and the merchant's path drawn underneath as
 * numbered stops, growing as they answer. What they sell is already asked by the store
 * setup wizard, so it isn't asked again here.
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
    const { profile } = useAuth();
    const [channel, setChannel] = useState<Channel | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const voice = useGuideVoice("welcome.hello", lineText("welcome.hello", locale), locale, soundOn);
    const ready = channel !== null && team !== null;

    const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? "";
    const title = firstName ? t("guide.welcome.hi", { name: firstName }) : t("guide.welcome.title");
    const path = welcomePath({
        inShop: channel === null ? null : channel === "online_and_shop",
        staff: team === null ? null : team === "staff",
    });

    return (
        <div className="fixed inset-0 z-[47] grid place-items-center-safe overflow-y-auto bg-black/50 p-4" data-testid="merchant-guide-welcome">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-guide-welcome-title"
                className="merchant-guide-card grid w-full max-w-[560px] gap-4 rounded-2xl bg-[var(--card-bg)] p-6 text-foreground shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="merchant-guide-mark" data-speaking={voice.speaking} aria-hidden="true">
                            <Compass className="h-5 w-5 text-[#EFFF00]" />
                        </span>
                        <h2 id="merchant-guide-welcome-title" dir={dir} className="text-xl font-bold">
                            {title}
                        </h2>
                    </div>
                    <GuideSoundButton soundOn={soundOn} speaking={voice.speaking} onToggle={onToggleSound} tone="light" />
                </div>
                <GuideCaption voice={voice} className="text-[15px] font-semibold" />

                <div className="grid gap-2">
                    <p dir={dir} className="text-left text-sm font-semibold">{lineText("welcome.channel", locale)}</p>
                    <GuideTiles<Channel>
                        label={lineText("welcome.channel", locale)}
                        value={channel}
                        onChange={setChannel}
                        options={[
                            { id: "online", label: t("guide.welcome.online"), hint: t("guide.welcome.onlineHint"), icon: Globe },
                            { id: "online_and_shop", label: t("guide.welcome.onlineAndShop"), hint: t("guide.welcome.onlineAndShopHint"), icon: Store },
                        ]}
                    />
                </div>
                <div className="grid gap-2">
                    <p dir={dir} className="text-left text-sm font-semibold">{lineText("welcome.staff", locale)}</p>
                    <GuideTiles<Team>
                        label={lineText("welcome.staff", locale)}
                        value={team}
                        onChange={setTeam}
                        options={[
                            { id: "solo", label: t("guide.welcome.justMe"), hint: t("guide.welcome.justMeHint"), icon: User },
                            { id: "staff", label: t("guide.welcome.staff"), hint: t("guide.welcome.staffHint"), icon: Users },
                        ]}
                    />
                </div>

                <div
                    className="grid gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4"
                    data-testid="merchant-guide-welcome-path"
                >
                    <p dir={dir} className="text-left text-xs font-bold text-muted-foreground">
                        {t("guide.welcome.path")}
                    </p>
                    <ol className="grid">
                        {path.rows.map((row, i) => (
                            <li
                                key={row.id}
                                className={cn("relative flex gap-3 pb-5", row.added && "merchant-guide-path-in")}
                                data-testid={`merchant-guide-path-${row.id}`}
                            >
                                <span className="absolute bottom-0.5 left-[11px] top-[26px] w-0.5 rounded-full bg-neutral-300" aria-hidden="true" />
                                <span
                                    className={cn(
                                        "relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                                        i === 0
                                            ? "bg-neutral-900 text-[#EFFF00]"
                                            : row.added
                                              ? "border-[1.5px] border-neutral-900 bg-[#EFFF00] text-neutral-900"
                                              : "border-[1.5px] border-neutral-300 bg-[var(--card-bg)] text-foreground",
                                    )}
                                    aria-hidden="true"
                                >
                                    {i + 1}
                                </span>
                                <div className="grid min-w-0 flex-1 gap-2 pt-0.5">
                                    <div className="flex items-center gap-2">
                                        <span dir={dir} className="flex-1 text-left text-sm font-bold">
                                            {t(row.labelKey)}
                                            {row.added && (
                                                <span className="ms-2 inline-block rounded-full bg-[#FBFFD1] px-2 py-0.5 align-middle text-[11px] font-semibold text-neutral-700">
                                                    {t("guide.welcome.added")}
                                                </span>
                                            )}
                                        </span>
                                        <span
                                            dir={dir}
                                            className="shrink-0 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
                                        >
                                            {row.id === "basics" ? t("guide.welcome.about", { count: row.minutes }) : t("guide.list.minutes", { count: row.minutes })}
                                        </span>
                                    </div>
                                    {row.stepKeys.length > 0 && (
                                        <ul dir={dir} className={cn("flex flex-wrap gap-1.5", dir === "rtl" && "justify-end")}>
                                            {row.stepKeys.map((key) => (
                                                <li
                                                    key={key}
                                                    className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-1 text-xs font-semibold"
                                                >
                                                    {t(key)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </li>
                        ))}
                        <li className="flex items-center gap-3" data-testid="merchant-guide-path-more">
                            <span
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-neutral-400 text-muted-foreground"
                                aria-hidden="true"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </span>
                            <span dir={dir} className="flex-1 text-left text-xs text-muted-foreground">
                                {t("guide.welcome.more", { count: path.more })}
                            </span>
                        </li>
                    </ol>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button
                        type="button"
                        disabled={!ready || saving}
                        onClick={() => {
                            if (channel && team) onStart({ channel, staff: team === "staff" });
                        }}
                        data-testid="merchant-guide-start"
                        className="h-12 shrink-0 rounded-xl bg-[#EFFF00] px-7 text-sm font-bold text-neutral-900 hover:brightness-95 disabled:bg-neutral-900 disabled:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    >
                        {t("guide.welcome.start")}
                    </button>
                    <p className="flex min-w-[12rem] flex-1 items-center gap-2 text-xs text-muted-foreground">
                        <Captions className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span dir={dir} className="flex-1 text-left">
                            {t("guide.welcome.voiceNote")}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    );
}
