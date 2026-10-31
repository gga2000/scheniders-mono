"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LabelSize, EnhancedLabelOptions } from "@/lib/enhanced-label-generator";
import {
    QrCode,
    Barcode,
    Tag,
    DollarSign,
    Gift,
    Truck,
    Building2,
    ChevronDown,
    Check,
    Settings,
    Upload,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface LabelSettingsPanelProps {
    settings: EnhancedLabelOptions;
    onSettingsChange: (settings: EnhancedLabelOptions) => void;
    isExpanded?: boolean;
}

const LABEL_SIZES: Array<{ value: LabelSize; label: string; descriptionKey: string | null; dims?: string }> = [
    { value: "80x120", label: "80×120 mm", descriptionKey: "printing.label_size80" },
    { value: "4x6", label: "4×6 inch", descriptionKey: "printing.label_size4x6" },
    { value: "3x2", label: "3×2 inch", descriptionKey: "printing.label_size3x2" },
    { value: "a5", label: "A5", descriptionKey: null, dims: "148 × 210 mm" },
    { value: "a6", label: "A6", descriptionKey: null, dims: "105 × 148 mm" },
    { value: "compact", label: "Compact", descriptionKey: "printing.label_sizeCompact", dims: "80 × 60 mm" },
];

export function LabelSettingsPanel({
    settings,
    onSettingsChange,
    isExpanded = true,
}: LabelSettingsPanelProps) {
    const { t } = useLanguage();
    const describeSize = (size?: (typeof LABEL_SIZES)[number]) =>
        [size?.descriptionKey ? t(size.descriptionKey) : null, size?.dims].filter(Boolean).join(" · ");
    const [showPanel, setShowPanel] = useState(isExpanded);
    const [showSizeDropdown, setShowSizeDropdown] = useState(false);

    const updateSetting = <K extends keyof EnhancedLabelOptions>(
        key: K,
        value: EnhancedLabelOptions[K]
    ) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    const toggleSettings: Array<{
        key: keyof EnhancedLabelOptions;
        icon: React.ElementType;
        label: string;
        description: string;
        colorOn: string;
        colorOff: string;
    }> = [
            {
                key: "showQrCode",
                icon: QrCode,
                label: t("printing.label_qr"),
                description: t("printing.label_qrDesc"),
                colorOn: "bg-purple-100 text-purple-700 border-purple-200",
                colorOff: "bg-[var(--background)] text-muted border-[var(--card-border)]",
            },
            {
                key: "showBarcode",
                icon: Barcode,
                label: t("printing.label_barcode"),
                description: t("printing.label_barcodeDesc"),
                colorOn: "bg-blue-100 text-blue-700 border-blue-200",
                colorOff: "bg-[var(--background)] text-muted border-[var(--card-border)]",
            },
            {
                key: "showPrice",
                icon: DollarSign,
                label: t("printing.label_price"),
                description: t("printing.label_priceDesc"),
                colorOn: "bg-green-100 text-green-700 border-green-200",
                colorOff: "bg-[var(--background)] text-muted border-[var(--card-border)]",
            },
            {
                key: "isGift",
                icon: Gift,
                label: t("printing.label_gift"),
                description: t("printing.label_giftDesc"),
                colorOn: "bg-pink-100 text-pink-700 border-pink-200",
                colorOff: "bg-[var(--background)] text-muted border-[var(--card-border)]",
            },
            {
                key: "showCompanyLogo",
                icon: Building2,
                label: t("printing.label_companyLogo"),
                description: t("printing.label_companyLogoDesc"),
                colorOn: "bg-amber-100 text-amber-700 border-amber-200",
                colorOff: "bg-[var(--background)] text-muted border-[var(--card-border)]",
            },
            {
                key: "showDeliveryLogo",
                icon: Truck,
                label: t("printing.label_deliveryLogo"),
                description: t("printing.label_deliveryLogoDesc"),
                colorOn: "bg-teal-100 text-teal-700 border-teal-200",
                colorOff: "bg-[var(--background)] text-muted border-[var(--card-border)]",
            },
        ];

    return (
        <div className="pastel-card overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setShowPanel(!showPanel)}
                className="w-full flex items-center justify-between p-4 hover:bg-[var(--background)] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--pastel-purple)] flex items-center justify-center">
                        <Settings className="w-5 h-5 text-purple-700" />
                    </div>
                    <div className="text-left">
                        <h3 className="font-semibold text-foreground">{t("printing.label_title")}</h3>
                        <p className="text-sm text-muted">
                            {t("printing.label_size")}: {LABEL_SIZES.find(s => s.value === settings.size)?.label || "4×6"}
                            {settings.showQrCode && " • QR"}
                            {settings.showBarcode && " • Barcode"}
                            {settings.isGift && " • Gift"}
                        </p>
                    </div>
                </div>
                <ChevronDown
                    className={cn(
                        "w-5 h-5 text-muted transition-transform",
                        showPanel && "rotate-180"
                    )}
                />
            </button>

            {/* Settings Panel */}
            <AnimatePresence>
                {showPanel && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0 space-y-4 border-t border-[var(--card-border)]">
                            {/* Label Size Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                    <Tag className="w-4 h-4 text-muted" />
                                    {t("printing.label_sizeTitle")}
                                </label>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] hover:border-[var(--foreground-muted)] transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[var(--pastel-blue)] flex items-center justify-center text-blue-700 font-mono text-xs font-bold">
                                                {settings.size.toUpperCase()}
                                            </div>
                                            <div className="text-left">
                                                <p className="font-medium text-foreground">
                                                    {LABEL_SIZES.find(s => s.value === settings.size)?.label}
                                                </p>
                                                <p className="text-xs text-muted">
                                                    {describeSize(LABEL_SIZES.find(s => s.value === settings.size))}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronDown className={cn("w-4 h-4 text-muted transition-transform", showSizeDropdown && "rotate-180")} />
                                    </button>

                                    {/* Size Dropdown */}
                                    <AnimatePresence>
                                        {showSizeDropdown && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="absolute top-full left-0 right-0 mt-2 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] shadow-xl z-20 overflow-hidden"
                                            >
                                                {LABEL_SIZES.map((size) => (
                                                    <button
                                                        key={size.value}
                                                        onClick={() => {
                                                            updateSetting("size", size.value);
                                                            setShowSizeDropdown(false);
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--background)] transition-colors",
                                                            settings.size === size.value && "bg-[var(--pastel-blue)]"
                                                        )}
                                                    >
                                                        <div className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center text-muted font-mono text-xs font-bold">
                                                            {size.value.toUpperCase()}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="font-medium text-foreground">{size.label}</p>
                                                            <p className="text-xs text-muted">{describeSize(size)}</p>
                                                        </div>
                                                        {settings.size === size.value && (
                                                            <Check className="w-4 h-4 text-blue-600" />
                                                        )}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Toggle Settings Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {toggleSettings.map((setting) => {
                                    const Icon = setting.icon;
                                    const isOn = settings[setting.key] as boolean;
                                    return (
                                        <button
                                            key={setting.key}
                                            onClick={() => updateSetting(setting.key, !isOn)}
                                            className={cn(
                                                "flex items-center gap-2 p-3 rounded-xl border transition-all",
                                                isOn ? setting.colorOn : setting.colorOff
                                            )}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span className="text-sm font-medium">{setting.label}</span>
                                            {isOn && <Check className="w-3 h-3 ml-auto" />}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Logo Upload Section */}
                            {(settings.showCompanyLogo || settings.showDeliveryLogo) && (
                                <div className="space-y-3 pt-2 border-t border-[var(--card-border)]">
                                    {settings.showCompanyLogo && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-muted flex items-center gap-2">
                                                <Building2 className="w-3 h-3" />
                                                {t("printing.label_companyLogo")}
                                            </label>
                                            <div className="flex items-center gap-3">
                                                {/* Logo Preview */}
                                                {settings.companyLogoUrl ? (
                                                    <div className="w-16 h-16 rounded-lg border border-[var(--card-border)] bg-white flex items-center justify-center overflow-hidden">
                                                        <img
                                                            src={settings.companyLogoUrl}
                                                            alt={t("printing.label_companyLogo")}
                                                            className="max-w-full max-h-full object-contain"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--card-border)] bg-[var(--background)] flex items-center justify-center">
                                                        <Upload className="w-5 h-5 text-muted" />
                                                    </div>
                                                )}

                                                {/* Upload / Remove Buttons */}
                                                <div className="flex-1 space-y-2">
                                                    <input
                                                        type="file"
                                                        id="company-logo-upload"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onloadend = () => {
                                                                    const base64 = reader.result as string;
                                                                    updateSetting("companyLogoUrl", base64);
                                                                    // Also save to localStorage for persistence
                                                                    localStorage.setItem("schneiders_company_logo", base64);
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => document.getElementById("company-logo-upload")?.click()}
                                                        className="w-full px-3 py-2 rounded-lg bg-[var(--pastel-purple)] text-purple-800 text-sm font-medium hover:bg-purple-200 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <Upload className="w-4 h-4" />
                                                        {settings.companyLogoUrl ? t("printing.label_changeLogo") : t("printing.label_uploadLogo")}
                                                    </button>
                                                    {settings.companyLogoUrl && (
                                                        <button
                                                            onClick={() => {
                                                                updateSetting("companyLogoUrl", undefined);
                                                                localStorage.removeItem("schneiders_company_logo");
                                                            }}
                                                            className="w-full px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-all flex items-center justify-center gap-1"
                                                        >
                                                            <X className="w-3 h-3" />
                                                            {t("printing.label_remove")}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {settings.showDeliveryLogo && (
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1">
                                                <label className="text-xs font-medium text-muted">{t("printing.label_deliveryUrl")}</label>
                                                <input
                                                    type="url"
                                                    placeholder="https://..."
                                                    value={settings.deliveryLogoUrl || ""}
                                                    onChange={(e) => updateSetting("deliveryLogoUrl", e.target.value)}
                                                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)]"
                                                />
                                            </div>
                                            {settings.deliveryLogoUrl && (
                                                <button
                                                    onClick={() => updateSetting("deliveryLogoUrl", undefined)}
                                                    className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
