"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@scheniders/ui/dialog";
import { Truck, ArrowLeft } from "lucide-react";

interface MoveToTransitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    count: number;
    onConfirm: () => void;
}

export function MoveToTransitDialog({ open, onOpenChange, count, onConfirm }: MoveToTransitDialogProps) {
    const handleConfirm = () => {
        onConfirm();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-md" dir="rtl" aria-describedby="move-transit-desc">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800 text-right">
                        <div className="p-2 rounded-xl bg-blue-100">
                            <Truck className="h-5 w-5 text-blue-600" />
                        </div>
                        نقل الطلبات إلى قيد التوصيل
                    </DialogTitle>
                    <DialogDescription id="move-transit-desc" className="text-right">
                        تأكيد تغيير حالة الطلبات بعد التصدير
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/80 text-right space-y-2">
                        <p className="text-sm text-slate-700 leading-relaxed">
                            أنت على وشك نقل{" "}
                            <span className="font-bold text-blue-700 tabular-nums">{count}</span>{" "}
                            {count === 1 ? "طلب" : "طلب"} من حالة{" "}
                            <span className="font-semibold px-2 py-0.5 rounded-md bg-green-100 text-green-700">مؤكد</span>{" "}
                            <ArrowLeft className="inline h-3.5 w-3.5 text-slate-400" />{" "}
                            إلى حالة{" "}
                            <span className="font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">قيد التوصيل</span>.
                        </p>
                        <p className="text-xs text-slate-500">
                            يمكنك التراجع عن هذا الإجراء بعد التأكيد.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                    >
                        ليس الآن
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 min-w-[160px]"
                    >
                        <Truck className="h-4 w-4" />
                        نقل {count} طلب
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
