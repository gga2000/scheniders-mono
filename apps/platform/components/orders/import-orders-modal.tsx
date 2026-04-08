"use client";

import { useState, useCallback, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseExcelFile, convertToDbOrder, type ParsedOrder, type ImportResult, type ProductCatalogueItem } from "@/lib/excel-importer";
import {
    Upload,
    FileSpreadsheet,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Loader2,
    ArrowLeft,
    ArrowRight,
    Package,
    User,
    Phone,
    MapPin,
    X,
} from "lucide-react";

interface ImportOrdersModalProps {
    open: boolean;
    onClose: () => void;
    onImport: (orders: Record<string, unknown>[]) => Promise<{ success: boolean; imported: number; errors?: string[] }>;
    existingOrderIds?: string[];
    productCatalogue?: ProductCatalogueItem[]; // Product catalogue for auto-matching
}

type Step = "upload" | "preview" | "importing" | "done";

export function ImportOrdersModal({
    open,
    onClose,
    onImport,
    existingOrderIds = [],
    productCatalogue = []
}: ImportOrdersModalProps) {
    const [step, setStep] = useState<Step>("upload");
    const [file, setFile] = useState<File | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [finalResult, setFinalResult] = useState<{ imported: number; errors: string[] } | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetState = useCallback(() => {
        setStep("upload");
        setFile(null);
        setImportResult(null);
        setSelectedOrders(new Set());
        setImporting(false);
        setImportProgress(0);
        setFinalResult(null);
    }, []);

    const handleClose = useCallback(() => {
        resetState();
        onClose();
    }, [onClose, resetState]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && isValidFile(droppedFile)) {
            processFile(droppedFile);
        }
    }, []);

    const isValidFile = (file: File): boolean => {
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv', // .csv
        ];
        const validExtensions = ['.xlsx', '.xls', '.csv'];

        return validTypes.includes(file.type) ||
            validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    };

    const processFile = async (selectedFile: File) => {
        setFile(selectedFile);

        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const result = parseExcelFile(arrayBuffer, productCatalogue);

            // Check for duplicates against existing orders
            const existingSet = new Set(existingOrderIds);
            let duplicateCount = 0;

            for (const order of result.orders) {
                if (existingSet.has(order.order_id)) {
                    order.validation.warnings.push('طلب موجود مسبقاً');
                    duplicateCount++;
                }
            }

            result.duplicateOrders = duplicateCount;
            setImportResult(result);

            // Auto-select valid, non-duplicate orders
            const autoSelected = new Set<string>();
            for (const order of result.orders) {
                if (order.validation.isValid && !existingSet.has(order.order_id)) {
                    autoSelected.add(order.order_id);
                }
            }
            setSelectedOrders(autoSelected);

            setStep("preview");
        } catch (error) {
            console.error("Error parsing file:", error);
            setImportResult({
                orders: [],
                totalRows: 0,
                validOrders: 0,
                errorOrders: 0,
                duplicateOrders: 0,
                errors: [{ row: 0, message: `خطأ في قراءة الملف: ${error}` }]
            });
            setStep("preview");
        }
    };

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile && isValidFile(selectedFile)) {
            processFile(selectedFile);
        }
    }, [existingOrderIds]);

    const toggleOrderSelection = (orderId: string) => {
        setSelectedOrders(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) {
                next.delete(orderId);
            } else {
                next.add(orderId);
            }
            return next;
        });
    };

    const selectAll = () => {
        if (!importResult) return;
        const all = new Set<string>();
        for (const order of importResult.orders) {
            if (order.validation.isValid) {
                all.add(order.order_id);
            }
        }
        setSelectedOrders(all);
    };

    const deselectAll = () => {
        setSelectedOrders(new Set());
    };

    const handleImport = async () => {
        if (!importResult) return;

        setStep("importing");
        setImporting(true);

        const ordersToImport = importResult.orders
            .filter(o => selectedOrders.has(o.order_id))
            .map(o => convertToDbOrder(o));

        const errors: string[] = [];
        let imported = 0;

        // Import in batches
        const batchSize = 10;
        for (let i = 0; i < ordersToImport.length; i += batchSize) {
            const batch = ordersToImport.slice(i, i + batchSize);

            try {
                const result = await onImport(batch);
                if (result.success) {
                    imported += result.imported;
                } else {
                    errors.push(...(result.errors || ['خطأ غير معروف']));
                }
            } catch (error) {
                errors.push(`خطأ في الدفعة ${Math.floor(i / batchSize) + 1}: ${error}`);
            }

            setImportProgress(Math.min(100, Math.round(((i + batchSize) / ordersToImport.length) * 100)));
        }

        setFinalResult({ imported, errors });
        setStep("done");
        setImporting(false);
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                        استيراد الطلبات من ملف Excel
                    </DialogTitle>
                    <DialogDescription>
                        {step === "upload" && "اختر ملف Excel أو CSV للاستيراد"}
                        {step === "preview" && "راجع الطلبات قبل الاستيراد"}
                        {step === "importing" && "جاري الاستيراد..."}
                        {step === "done" && "تم الانتهاء"}
                    </DialogDescription>
                </DialogHeader>

                {/* Step: Upload */}
                {step === "upload" && (
                    <div className="flex-1 py-8">
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
                                dragActive
                                    ? "border-emerald-500 bg-emerald-50"
                                    : "border-gray-300 hover:border-emerald-400 hover:bg-gray-50"
                            )}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <Upload className={cn(
                                "w-16 h-16 mx-auto mb-4",
                                dragActive ? "text-emerald-500" : "text-gray-400"
                            )} />
                            <p className="text-lg font-medium text-gray-700 mb-2">
                                {dragActive ? "أفلت الملف هنا" : "اسحب الملف هنا أو اضغط للاختيار"}
                            </p>
                            <p className="text-sm text-gray-500">
                                يدعم ملفات Excel (.xlsx, .xls) و CSV
                            </p>
                        </div>

                        {/* Expected format */}
                        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <p className="text-sm font-medium text-blue-800 mb-2">الأعمدة المتوقعة:</p>
                            <div className="flex flex-wrap gap-2">
                                {['رقم الوصل', 'التاريخ', 'اسم المنتج', 'SKU', 'سعر المنتج', 'الكمية', 'اسم الزبون', 'رقم الهاتف الاول', 'رقم الهاتف الثاني', 'العنوان', 'حالة الطلب', 'ملاحظة'].map(col => (
                                    <span key={col} className="px-2 py-1 bg-white rounded-lg text-xs text-blue-700 border border-blue-200">
                                        {col}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step: Preview */}
                {step === "preview" && importResult && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Stats */}
                        <div className="flex gap-4 mb-4">
                            <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-gray-800">{importResult.orders.length}</p>
                                <p className="text-xs text-gray-600">إجمالي الطلبات</p>
                            </div>
                            <div className="flex-1 bg-emerald-50 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-emerald-700">{selectedOrders.size}</p>
                                <p className="text-xs text-emerald-600">محدد للاستيراد</p>
                            </div>
                            <div className="flex-1 bg-yellow-50 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-yellow-700">{importResult.duplicateOrders}</p>
                                <p className="text-xs text-yellow-600">مكرر</p>
                            </div>
                            <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-red-700">{importResult.errorOrders}</p>
                                <p className="text-xs text-red-600">خطأ</p>
                            </div>
                        </div>

                        {/* Selection controls */}
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={selectAll}
                                className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                تحديد الكل
                            </button>
                            <button
                                onClick={deselectAll}
                                className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                إلغاء التحديد
                            </button>
                        </div>

                        {/* Order list */}
                        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl">
                            {importResult.orders.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-500" />
                                    <p>لم يتم العثور على طلبات صالحة</p>
                                    {importResult.errors.length > 0 && (
                                        <div className="mt-4 text-sm text-red-600">
                                            {importResult.errors.map((err, i) => (
                                                <p key={i}>صف {err.row}: {err.message}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {importResult.orders.map((order) => (
                                        <OrderPreviewRow
                                            key={order.order_id}
                                            order={order}
                                            selected={selectedOrders.has(order.order_id)}
                                            onToggle={() => toggleOrderSelection(order.order_id)}
                                            isDuplicate={existingOrderIds.includes(order.order_id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Step: Importing */}
                {step === "importing" && (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                        <Loader2 className="w-16 h-16 text-emerald-600 animate-spin mb-6" />
                        <p className="text-lg font-medium text-gray-700 mb-4">جاري استيراد الطلبات...</p>
                        <div className="w-64 bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-emerald-500 h-full transition-all duration-300"
                                style={{ width: `${importProgress}%` }}
                            />
                        </div>
                        <p className="text-sm text-gray-500 mt-2">{importProgress}%</p>
                    </div>
                )}

                {/* Step: Done */}
                {step === "done" && finalResult && (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                        {finalResult.imported > 0 ? (
                            <CheckCircle className="w-20 h-20 text-emerald-500 mb-6" />
                        ) : (
                            <XCircle className="w-20 h-20 text-red-500 mb-6" />
                        )}
                        <p className="text-2xl font-bold text-gray-800 mb-2">
                            تم استيراد {finalResult.imported} طلب
                        </p>
                        {finalResult.errors.length > 0 && (
                            <div className="mt-4 p-4 bg-red-50 rounded-xl max-w-md">
                                <p className="text-sm font-medium text-red-700 mb-2">أخطاء:</p>
                                <div className="text-xs text-red-600 max-h-32 overflow-y-auto">
                                    {finalResult.errors.map((err, i) => (
                                        <p key={i}>{err}</p>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="flex gap-2">
                    {step === "upload" && (
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            إلغاء
                        </button>
                    )}

                    {step === "preview" && (
                        <>
                            <button
                                onClick={resetState}
                                className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <ArrowRight className="w-4 h-4" />
                                رجوع
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={selectedOrders.size === 0}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors",
                                    selectedOrders.size > 0
                                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                )}
                            >
                                استيراد {selectedOrders.size} طلب
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {step === "done" && (
                        <button
                            onClick={handleClose}
                            className="px-6 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium transition-colors"
                        >
                            تم
                        </button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// =============================================
// Order Preview Row Component
// =============================================

function OrderPreviewRow({
    order,
    selected,
    onToggle,
    isDuplicate
}: {
    order: ParsedOrder;
    selected: boolean;
    onToggle: () => void;
    isDuplicate: boolean;
}) {
    const hasErrors = !order.validation.isValid;
    const hasWarnings = order.validation.warnings.length > 0;

    return (
        <div
            onClick={onToggle}
            className={cn(
                "flex items-center gap-4 p-3 cursor-pointer transition-colors",
                selected ? "bg-emerald-50" : "hover:bg-gray-50",
                hasErrors && "bg-red-50 hover:bg-red-100",
                isDuplicate && !hasErrors && "bg-yellow-50 hover:bg-yellow-100"
            )}
        >
            {/* Checkbox */}
            <div className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0",
                selected
                    ? "bg-emerald-600 border-emerald-600"
                    : hasErrors
                        ? "border-red-300"
                        : "border-gray-300"
            )}>
                {selected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
            </div>

            {/* Order ID */}
            <div className="w-20 flex-shrink-0">
                <p className="font-mono font-bold text-sm">#{order.order_id}</p>
            </div>

            {/* Customer */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <p className="font-medium text-sm truncate">{order.customer_name}</p>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <p className="text-xs text-gray-500 font-mono" dir="ltr">{order.phone}</p>
                </div>
            </div>

            {/* Address */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-xs text-gray-600 truncate">{order.address_details || "—"}</p>
                </div>
                {order.governorate_code && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded">
                        {order.governorate_code}
                    </span>
                )}
            </div>

            {/* Items */}
            <div className="w-32 flex-shrink-0">
                <div className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-xs text-gray-600">{order.items.length} منتج</p>
                </div>
                <p className="text-sm font-bold mt-0.5">{order.price.toLocaleString()} IQD</p>
            </div>

            {/* Status */}
            <div className="w-28 flex-shrink-0">
                {hasErrors && (
                    <div className="flex items-center gap-1 text-red-600">
                        <XCircle className="w-4 h-4" />
                        <span className="text-xs">{order.validation.errors[0]}</span>
                    </div>
                )}
                {!hasErrors && isDuplicate && (
                    <div className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-xs">مكرر</span>
                    </div>
                )}
                {!hasErrors && !isDuplicate && hasWarnings && (
                    <div className="flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-xs">{order.validation.warnings[0]}</span>
                    </div>
                )}
                {!hasErrors && !isDuplicate && !hasWarnings && (
                    <div className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs">جاهز</span>
                    </div>
                )}
            </div>
        </div>
    );
}
