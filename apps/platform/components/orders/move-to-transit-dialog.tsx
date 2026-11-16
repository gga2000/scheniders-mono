"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@scheniders/ui/dialog";
import { Truck, ArrowRight } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";

interface MoveToTransitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    count: number;
    /** The courier the file went to; each moved order is marked «with …» (Fermi B4). */
    courierName?: string;
    onConfirm: () => void;
}

export function MoveToTransitDialog({ open, onOpenChange, count, courierName, onConfirm }: MoveToTransitDialogProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const handleConfirm = () => {
        onConfirm();
        onOpenChange(false);
    };
    const courier = courierName?.trim();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-md" aria-describedby="move-transit-desc">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-end gap-2 text-slate-800">
                        {t("shipExport.transit.title")}
                        <div className="p-2 rounded-xl bg-blue-100">
                            <Truck className="h-5 w-5 text-blue-600" />
                        </div>
                    </DialogTitle>
                    <DialogDescription id="move-transit-desc" dir={dir} className="text-right">
                        {t("shipExport.transit.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    <div dir={dir} className="p-4 rounded-xl border border-blue-200 bg-blue-50/80 space-y-3">
                        <p className="text-sm text-slate-700 leading-relaxed">
                            {t("shipExport.transit.body", { count })}
                        </p>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-semibold px-2 py-0.5 rounded-md bg-green-100 text-green-700">{t("shipExport.transit.confirmed")}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 rtl:rotate-180" />
                            <span className="font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">{t("shipExport.transit.inTransit")}</span>
                        </div>
                        {courier && (
                            <p className="text-sm font-medium text-slate-700" data-testid="move-transit-courier">
                                {t("shipExport.transit.withCourier", { courier })}
                            </p>
                        )}
                        <p className="text-xs text-slate-500">
                            {t("shipExport.transit.undo")}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                    >
                        {t("shipExport.transit.notNow")}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 min-w-[160px]"
                    >
                        <Truck className="h-4 w-4" />
                        {t("shipExport.transit.confirm", { count })}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
