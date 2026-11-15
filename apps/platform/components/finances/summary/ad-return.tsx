"use client";

import Link from "next/link";
import { ArrowUpRight, Megaphone } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { adReturn, perOrder, type ProfitStatement } from "@/lib/finance/summary";
import { COST_COLORS } from "./colors";
import { Emphasis } from "./emphasis";
import { formatWhole, useMoneyText } from "./money";
import { SummaryTile } from "./summary-tile";

interface AdReturnProps {
    statement: ProfitStatement;
}

const linkClass =
    "inline-flex items-center gap-1 text-[13px] font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current";

/** Are the ads worth it, in one sentence: the sales each 1,000 IQD of ads brought, with the two drawn to scale. */
export function AdReturn({ statement }: AdReturnProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const spent = statement.lines.find((l) => l.id === "ads")?.amount ?? 0;
    const brought = adReturn(statement);
    const each = perOrder(spent, statement.orders);

    return (
        <SummaryTile
            icon={Megaphone}
            color={COST_COLORS.ads}
            title={t("fin.ads.title")}
            textDir={dir}
            testId="ad-return"
            footer={
                <Link href="/ads" className={linkClass}>
                    {t("fin.detail.ads.open")}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
            }
        >
            {brought === null ? (
                <p className="text-left text-[14px] leading-relaxed text-muted" dir={dir}>{t("fin.ads.none")}</p>
            ) : (
                <>
                    <p className="text-left text-[19px] font-medium leading-normal text-foreground" dir={dir} data-testid="ad-return-say">
                        <Emphasis text={t("fin.ads.say", { got: formatWhole(brought) })} />
                    </p>
                    <div className="flex h-2.5 gap-[3px]" aria-hidden="true">
                        <span className="min-w-[6px] rounded-full" style={{ flexGrow: 1000, background: COST_COLORS.ads }} />
                        <span className="min-w-[6px] rounded-full bg-stone-900 dark:bg-stone-100" style={{ flexGrow: Math.max(brought, 1) }} />
                    </div>
                    <p className="text-left text-[13px] leading-relaxed text-muted" dir={dir}>
                        {each === null
                            ? t("fin.ads.spent", { spent: money(spent) })
                            : t("fin.ads.spentEach", { spent: money(spent), each: money(each) })}
                    </p>
                </>
            )}
        </SummaryTile>
    );
}
