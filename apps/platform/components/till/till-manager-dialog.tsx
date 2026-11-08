"use client";

import { useState } from "react";
import { Delete, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { useTillApprove, type TillApprovalPurpose } from "@/hooks/use-till";
import type { TillMember } from "@/hooks/use-shops";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";

interface Props {
    sessionId: string;
    managers: TillMember[];
    /** What the manager is allowing, e.g. "Discount 30,000 (limit 10,000)". */
    reason: string;
    /** The price cuts + discount being allowed; null when no amount is involved (testers). */
    maxOff: number | null;
    /** The one job this OK is for: a sale, a cash payout or a tester. */
    purpose: TillApprovalPurpose;
    onApproved: (approval: { id: string; managerName: string }) => void;
    onClose: () => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** A manager taps their name and types their PIN on the till to allow one sale over the cashier's limit. */
export function TillManagerDialog({ sessionId, managers, reason, maxOff, purpose, onApproved, onClose }: Props) {
    const { t } = useLanguage();
    const approve = useTillApprove();
    const [who, setWho] = useState<TillMember | null>(managers.length === 1 ? managers[0] : null);
    const [pin, setPin] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    const press = (digit: string) => {
        if (!who || approve.isPending) return;
        const next = (pin + digit).slice(0, 4);
        setPin(next);
        setMessage(null);
        if (next.length < 4) return;
        approve.mutate(
            { sessionId, managerId: who.user_id, pin: next, maxOff, purpose },
            {
                onSuccess: (r) => {
                    if (r.result === "ok" && r.approval_id) {
                        onApproved({ id: r.approval_id, managerName: who.display_name });
                        return;
                    }
                    setPin("");
                    setMessage(t(`till.manager.${r.result}`));
                },
                onError: () => {
                    setPin("");
                    setMessage(t("till.manager.failed"));
                },
            },
        );
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="till-screen md:max-w-md">
                <div className="flex flex-col gap-5">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-left">
                        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                        {t("till.manager.title")}
                    </DialogTitle>
                    <DialogDescription className="text-left tabular-nums" dir="auto">
                        {reason}
                    </DialogDescription>
                </DialogHeader>

                {managers.length === 0 ? (
                    <p className="text-left text-sm text-muted" dir="auto">{t("till.manager.none")}</p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-2">
                            {managers.map((m) => (
                                <button
                                    key={m.user_id}
                                    type="button"
                                    onClick={() => {
                                        setWho(m);
                                        setPin("");
                                        setMessage(null);
                                    }}
                                    aria-pressed={who?.user_id === m.user_id}
                                    className={cn(
                                        "flex h-12 items-center gap-2 rounded-2xl border ps-2 pe-4 text-sm font-semibold",
                                        who?.user_id === m.user_id ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                                    )}
                                >
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E4C1F9] text-xs text-[#1E1E1E]" aria-hidden="true">
                                        {m.display_name.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span dir="auto">{m.display_name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex h-10 items-center justify-center gap-3" aria-live="polite">
                            {[0, 1, 2, 3].map((i) => (
                                <span
                                    key={i}
                                    className={cn("h-3.5 w-3.5 rounded-full border-2 border-foreground/40", i < pin.length && "border-foreground bg-foreground")}
                                />
                            ))}
                        </div>
                        <p className={cn("min-h-5 text-center text-sm", message ? "font-semibold text-red-600" : "text-muted")} dir="auto">
                            {message ?? (who ? t("till.lock.typePin", { name: who.display_name }) : t("till.manager.pick"))}
                        </p>

                        <div className="grid grid-cols-3 gap-2">
                            {KEYS.map((k) => (
                                <button
                                    key={k}
                                    type="button"
                                    disabled={!who || approve.isPending}
                                    onClick={() => press(k)}
                                    className="h-14 rounded-2xl border border-[var(--card-border)] text-xl font-semibold tabular-nums text-foreground active:bg-[var(--card-border)]/40 disabled:opacity-40"
                                >
                                    {k}
                                </button>
                            ))}
                            <span />
                            <button
                                type="button"
                                disabled={!who || approve.isPending}
                                onClick={() => press("0")}
                                className="h-14 rounded-2xl border border-[var(--card-border)] text-xl font-semibold tabular-nums text-foreground active:bg-[var(--card-border)]/40 disabled:opacity-40"
                            >
                                0
                            </button>
                            <button
                                type="button"
                                disabled={!who || pin.length === 0}
                                onClick={() => setPin((p) => p.slice(0, -1))}
                                aria-label={t("till.lock.delete")}
                                className="flex h-14 items-center justify-center rounded-2xl border border-[var(--card-border)] text-foreground disabled:opacity-40"
                            >
                                <Delete className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    </>
                )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
