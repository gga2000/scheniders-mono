"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { Input } from "@scheniders/ui/input";
import {
    Upload,
    Check,
    Loader2,
    Sparkles,
    AlertCircle,
    Trash2,
    Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";

interface ExtractedData {
    id: string;
    image: string;
    customer_name: string;
    phone: string;
    secondary_phone: string;
    city: string;
    address: string;
    status: 'pending' | 'processing' | 'success' | 'error';
    error?: string;
}

interface BulkUploadModalProps {
    open: boolean;
    onClose: () => void;
    onCreate: (orders: ExtractedData[]) => Promise<void>;
}

export function BulkUploadModal({ open, onClose, onCreate }: BulkUploadModalProps) {
    const { session } = useAuth();
    const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelect = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const newData: ExtractedData[] = Array.from(files).map((file, index) => ({
            id: `${Date.now()}-${index}`,
            image: URL.createObjectURL(file),
            customer_name: '',
            phone: '',
            secondary_phone: '',
            city: '',
            address: '',
            status: 'pending' as const,
        }));

        setExtractedData(prev => [...prev, ...newData]);

        // Process each image
        setIsProcessing(true);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const dataId = newData[i].id;

            // Update status to processing
            setExtractedData(prev => prev.map(item =>
                item.id === dataId ? { ...item, status: 'processing' as const } : item
            ));

            try {
                const formData = new FormData();
                formData.append('image', file);

                // The route requires a bearer token. Without it every image came
                // back 401 and the tile just showed "فشل التحليل", so bulk image
                // extraction has never actually worked.
                const response = await fetch('/api/orders/analyze-image', {
                    method: 'POST',
                    headers: {
                        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                    },
                    body: formData,
                });

                const result = await response.json();

                if (result.success && result.data) {
                    setExtractedData(prev => prev.map(item =>
                        item.id === dataId
                            ? {
                                ...item,
                                customer_name: result.data.customer_name || '',
                                phone: result.data.phone || '',
                                secondary_phone: result.data.secondary_phone || '',
                                city: result.data.city || '',
                                address: result.data.address || '',
                                status: 'success' as const,
                            }
                            : item
                    ));
                } else {
                    setExtractedData(prev => prev.map(item =>
                        item.id === dataId
                            ? { ...item, status: 'error' as const, error: result.error || 'فشل التحليل' }
                            : item
                    ));
                }
            } catch {
                setExtractedData(prev => prev.map(item =>
                    item.id === dataId
                        ? { ...item, status: 'error' as const, error: 'خطأ في الاتصال' }
                        : item
                ));
            }
        }
        setIsProcessing(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileSelect(e.dataTransfer.files);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleRemoveItem = (id: string) => {
        setExtractedData(prev => prev.filter(item => item.id !== id));
    };

    const handleUpdateField = (id: string, field: keyof ExtractedData, value: string) => {
        setExtractedData(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const handleBulkCreate = async () => {
        const validData = extractedData.filter(item => item.status === 'success' && item.phone);
        if (validData.length === 0) {
            alert('لا توجد بيانات صالحة للإنشاء');
            return;
        }

        await onCreate(validData);
        setExtractedData([]);
        onClose();
    };

    const successCount = extractedData.filter(item => item.status === 'success').length;
    const errorCount = extractedData.filter(item => item.status === 'error').length;
    const processingCount = extractedData.filter(item => item.status === 'processing').length;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] bg-white border border-[var(--card-border)] !rounded-2xl overflow-hidden p-0">
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b border-[var(--card-border)] bg-gradient-to-r from-purple-50 to-pink-50">
                    <DialogTitle className="flex items-center justify-between text-foreground">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
                                <Sparkles className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <span className="text-xl font-bold">رفع طلبات متعددة</span>
                                <p className="text-xs font-normal text-muted mt-0.5">ارفع عدة صور واستخرج البيانات تلقائياً</p>
                            </div>
                        </div>
                        {extractedData.length > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                                    ✓ {successCount}
                                </div>
                                {errorCount > 0 && (
                                    <div className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                                        ✗ {errorCount}
                                    </div>
                                )}
                                {processingCount > 0 && (
                                    <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                                        ⟳ {processingCount}
                                    </div>
                                )}
                            </div>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col h-full">
                    {/* Upload Area */}
                    {extractedData.length === 0 && (
                        <div className="p-8">
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => handleFileSelect(e.target.files)}
                                className="hidden"
                                id="bulk-image-upload"
                            />
                            <label
                                htmlFor="bulk-image-upload"
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-4 p-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                                    isDragging
                                        ? "border-purple-500 bg-purple-50 scale-105"
                                        : "border-gray-300 hover:border-purple-400 hover:bg-purple-50/30"
                                )}
                            >
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                                    <Upload className="h-10 w-10 text-purple-600" />
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-gray-800 mb-2">
                                        اسحب الصور هنا أو اضغط للاختيار
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        يمكنك رفع عدة صور دفعة واحدة • سيتم استخراج البيانات تلقائياً
                                    </p>
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Data Review Grid */}
                    {extractedData.length > 0 && (
                        <>
                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-1 gap-4">
                                    {extractedData.map((item) => (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "relative flex gap-4 p-4 rounded-xl border-2 transition-all",
                                                item.status === 'success' && "border-green-200 bg-green-50/50",
                                                item.status === 'error' && "border-red-200 bg-red-50/50",
                                                item.status === 'processing' && "border-blue-200 bg-blue-50/50 animate-pulse",
                                                item.status === 'pending' && "border-gray-200 bg-gray-50/50"
                                            )}
                                        >
                                            {/* Image Preview */}
                                            <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200 shrink-0">
                                                <img src={item.image} alt="Preview" className="w-full h-full object-cover" />
                                                {item.status === 'processing' && (
                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                                                    </div>
                                                )}
                                                {item.status === 'success' && (
                                                    <div className="absolute top-1 right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                                        <Check className="h-4 w-4 text-white" />
                                                    </div>
                                                )}
                                                {item.status === 'error' && (
                                                    <div className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                                                        <AlertCircle className="h-4 w-4 text-white" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Extracted Data Fields */}
                                            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-2">
                                                <Input
                                                    value={item.customer_name}
                                                    onChange={(e) => handleUpdateField(item.id, 'customer_name', e.target.value)}
                                                    placeholder="اسم العميل"
                                                    className="h-9 text-sm"
                                                    disabled={item.status === 'processing'}
                                                />
                                                <Input
                                                    value={item.phone}
                                                    onChange={(e) => handleUpdateField(item.id, 'phone', e.target.value)}
                                                    placeholder="07XXXXXXXX"
                                                    className="h-9 text-sm font-mono"
                                                    dir="ltr"
                                                    disabled={item.status === 'processing'}
                                                />
                                                <Input
                                                    value={item.city}
                                                    onChange={(e) => handleUpdateField(item.id, 'city', e.target.value)}
                                                    placeholder="المحافظة"
                                                    className="h-9 text-sm"
                                                    disabled={item.status === 'processing'}
                                                />
                                                <Input
                                                    value={item.address}
                                                    onChange={(e) => handleUpdateField(item.id, 'address', e.target.value)}
                                                    placeholder="العنوان التفصيلي"
                                                    className="h-9 text-sm col-span-2"
                                                    disabled={item.status === 'processing'}
                                                />
                                                {item.error && (
                                                    <div className="col-span-full text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                                                        {item.error}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Remove Button */}
                                            <button
                                                onClick={() => handleRemoveItem(item.id)}
                                                className="absolute top-2 left-2 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-md"
                                                disabled={item.status === 'processing'}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="border-t border-[var(--card-border)] bg-[var(--background)] px-6 py-4 flex items-center justify-between gap-4">
                                <label htmlFor="bulk-image-upload" className="cursor-pointer">
                                    <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-all">
                                        <Upload className="h-4 w-4" />
                                        إضافة المزيد
                                    </div>
                                </label>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                                        disabled={isProcessing}
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        onClick={handleBulkCreate}
                                        disabled={successCount === 0 || isProcessing}
                                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Package className="h-4 w-4" />
                                        إنشاء {successCount} طلب
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
