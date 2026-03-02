"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PackagePlus, Copy, Sparkles } from "lucide-react";

interface ReorderChoiceDialogProps {
    open: boolean;
    onClose: () => void;
    onNewOrder: () => void;
    onReorderLast: () => void;
    hasOrders: boolean;
}

export function ReorderChoiceDialog({
    open,
    onClose,
    onNewOrder,
    onReorderLast,
    hasOrders,
}: ReorderChoiceDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-md bg-[var(--card-bg)] border-[var(--card-border)]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-green-500" />
                        Create Order for Customer
                    </DialogTitle>
                    <DialogDescription>
                        Choose how to create the new order
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 py-4">
                    {/* New Order Option */}
                    <button
                        onClick={() => {
                            onNewOrder();
                            onClose();
                        }}
                        className="group relative overflow-hidden rounded-xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 text-left transition-all hover:border-green-300 dark:hover:border-green-700 hover:shadow-lg hover:shadow-green-500/10"
                    >
                        <div className="flex items-start gap-4">
                            <div className="rounded-full bg-green-500 p-3 text-white shadow-md shadow-green-500/30 group-hover:scale-110 transition-transform">
                                <PackagePlus className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                                    New Order
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Start fresh with customer info pre-filled. Add products manually.
                                </p>
                            </div>
                        </div>
                        <div className="absolute top-2 right-2">
                            <span className="text-xs font-bold uppercase tracking-wider bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                                Recommended
                            </span>
                        </div>
                    </button>

                    {/* Reorder Last Option */}
                    <button
                        onClick={() => {
                            if (hasOrders) {
                                onReorderLast();
                                onClose();
                            }
                        }}
                        disabled={!hasOrders}
                        className="group relative overflow-hidden rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6 text-left transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg hover:shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-blue-200 dark:disabled:hover:border-blue-800 disabled:hover:shadow-none"
                    >
                        <div className="flex items-start gap-4">
                            <div className="rounded-full bg-blue-500 p-3 text-white shadow-md shadow-blue-500/30 group-hover:scale-110 transition-transform group-disabled:scale-100">
                                <Copy className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                                    Reorder Last
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {hasOrders
                                        ? "Copy customer info and items from the most recent order."
                                        : "No previous orders available for this customer."}
                                </p>
                            </div>
                        </div>
                    </button>
                </div>

                <div className="flex justify-end pt-2">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
