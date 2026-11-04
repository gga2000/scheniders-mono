"use client";

import { Input } from "@scheniders/ui/input";
import { Label } from "@scheniders/ui/label";
import { cn } from "@/lib/utils";
import { TAKE_KINDS } from "@/types/order";
import type { CreateOrderModel } from "./use-create-order-model";

const PRICING = ["free", "set"] as const;

/** Who took the stock and whether they pay. Shown instead of the customer block when "Taken" is picked. */
export function CreateOrderTakeSection({ m }: { m: CreateOrderModel }) {
    const { t, takeKind, setTakeKind, takenBy, setTakenBy, takePricing, setTakePricing, errors } = m;
    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-700 bg-slate-100 px-3 py-2 rounded-lg">{t("orders.create.takeNote")}</p>
            <div className="flex flex-wrap gap-1.5">
                {TAKE_KINDS.map((kind) => (
                    <button
                        key={kind}
                        type="button"
                        onClick={() => setTakeKind(kind)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                            takeKind === kind
                                ? "border-slate-400 bg-slate-100 text-slate-700"
                                : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                        )}
                    >
                        {t(`orders.create.takeKind.${kind}`)}
                    </button>
                ))}
            </div>
            <div className="space-y-1">
                <Label className="text-[11px] text-muted">
                    {t("orders.create.takenBy")}{takeKind === "sample" && <span className="text-gray-400"> {t("orders.create.optional")}</span>}
                </Label>
                <Input
                    value={takenBy}
                    onChange={(e) => setTakenBy(e.target.value)}
                    placeholder={t("orders.create.takenByPlaceholder")}
                    maxLength={80}
                    data-error={!!errors.taken_by}
                    className={cn("h-9 rounded-lg text-sm", errors.taken_by && "border-red-300 bg-red-50")}
                />
                {errors.taken_by && <p className="text-[11px] text-red-500">{errors.taken_by}</p>}
            </div>
            <div className="space-y-1">
                <Label className="text-[11px] text-muted">{t("orders.create.takePrice")}</Label>
                <div className="flex gap-1.5">
                    {PRICING.map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setTakePricing(mode)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                                takePricing === mode
                                    ? "border-slate-400 bg-slate-100 text-slate-700"
                                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                            )}
                        >
                            {t(`orders.create.takePricing.${mode}`)}
                        </button>
                    ))}
                </div>
                {takePricing === "set" && <p className="text-[11px] text-gray-500">{t("orders.create.takePaidHint")}</p>}
            </div>
        </div>
    );
}
