"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { Save, MapPin } from "lucide-react";

const IRAQ_GOVERNORATES = [
    { id: "baghdad",      nameEn: "Baghdad",       nameAr: "بغداد",        capital: true },
    { id: "basra",        nameEn: "Basra",          nameAr: "البصرة",       capital: false },
    { id: "nineveh",      nameEn: "Nineveh",        nameAr: "نينوى",        capital: false },
    { id: "erbil",        nameEn: "Erbil",          nameAr: "أربيل",        capital: false },
    { id: "sulaymaniyah", nameEn: "Sulaymaniyah",   nameAr: "السليمانية",   capital: false },
    { id: "dohuk",        nameEn: "Dohuk",          nameAr: "دهوك",         capital: false },
    { id: "kirkuk",       nameEn: "Kirkuk",         nameAr: "كركوك",        capital: false },
    { id: "anbar",        nameEn: "Anbar",          nameAr: "الأنبار",      capital: false },
    { id: "babel",        nameEn: "Babel",          nameAr: "بابل",         capital: false },
    { id: "diyala",       nameEn: "Diyala",         nameAr: "ديالى",        capital: false },
    { id: "karbala",      nameEn: "Karbala",        nameAr: "كربلاء",       capital: false },
    { id: "maysan",       nameEn: "Maysan",         nameAr: "ميسان",        capital: false },
    { id: "muthanna",     nameEn: "Muthanna",       nameAr: "المثنى",       capital: false },
    { id: "najaf",        nameEn: "Najaf",          nameAr: "النجف",        capital: false },
    { id: "qadisiyyah",   nameEn: "Qadisiyyah",     nameAr: "القادسية",     capital: false },
    { id: "salah_al_din", nameEn: "Salah al-Din",   nameAr: "صلاح الدين",   capital: false },
    { id: "thi_qar",      nameEn: "Thi-Qar",        nameAr: "ذي قار",       capital: false },
    { id: "wasit",        nameEn: "Wasit",          nameAr: "واسط",         capital: false },
] as const;

export function DeliveryFeesForm() {
    const { settings, updateSetting, loading } = useSettings();
    const [govFees, setGovFees] = useState<Record<string, number>>({});
    const [defaultFee, setDefaultFee] = useState<number>(8000);
    const [freeShipping, setFreeShipping] = useState<number>(0);
    const [bulkValue, setBulkValue] = useState("");
    const [govSearch, setGovSearch] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!settings.delivery_fees) return;
        const f = settings.delivery_fees;
        if (f.governorates) {
            setGovFees(f.governorates);
        } else {
            // Migrate old format (baghdad / provinces / default)
            const provinceDefault = f.provinces ?? f.default ?? 8000;
            const initial: Record<string, number> = {};
            IRAQ_GOVERNORATES.forEach((g) => {
                initial[g.id] = g.id === "baghdad" ? (f.baghdad ?? provinceDefault) : provinceDefault;
            });
            setGovFees(initial);
        }
        setDefaultFee(f.default ?? 8000);
        setFreeShipping(f.free_shipping_threshold ?? 0);
    }, [settings.delivery_fees]);

    const handleSave = async () => {
        setIsSaving(true);
        await updateSetting("delivery_fees", {
            governorates: govFees,
            default: defaultFee,
            free_shipping_threshold: freeShipping,
        });
        setIsSaving(false);
    };

    const applyBulkToAll = () => {
        if (!bulkValue) return;
        const val = Number(bulkValue);
        const updated: Record<string, number> = {};
        IRAQ_GOVERNORATES.forEach((g) => { updated[g.id] = val; });
        setGovFees(updated);
    };

    const applyBulkToProvinces = () => {
        if (!bulkValue) return;
        const val = Number(bulkValue);
        setGovFees((prev) => {
            const updated = { ...prev };
            IRAQ_GOVERNORATES.filter((g) => !g.capital).forEach((g) => { updated[g.id] = val; });
            return updated;
        });
    };

    const filteredGovs = IRAQ_GOVERNORATES.filter(
        (g) =>
            !govSearch ||
            g.nameEn.toLowerCase().includes(govSearch.toLowerCase()) ||
            g.nameAr.includes(govSearch)
    );

    if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

    return (
        <div className="space-y-4">
            {/* Bulk Set */}
            <div className="flex items-center gap-2 p-3 bg-(--pastel-mint-light) rounded-xl border border-(--card-border)">
                <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                <input
                    type="number"
                    placeholder="Amount (IQD)"
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="flex-1 h-8 rounded-lg border border-(--card-border) bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--pastel-mint)"
                />
                <button
                    onClick={applyBulkToAll}
                    disabled={!bulkValue}
                    className="h-8 px-3 rounded-lg bg-(--pastel-mint) text-teal-800 text-xs font-medium hover:opacity-80 disabled:opacity-40 transition-opacity whitespace-nowrap"
                >
                    All
                </button>
                <button
                    onClick={applyBulkToProvinces}
                    disabled={!bulkValue}
                    className="h-8 px-3 rounded-lg bg-(--pastel-blue) text-blue-800 text-xs font-medium hover:opacity-80 disabled:opacity-40 transition-opacity whitespace-nowrap"
                >
                    Provinces
                </button>
            </div>

            {/* Governorate search */}
            <input
                type="text"
                placeholder="Search governorate..."
                value={govSearch}
                onChange={(e) => setGovSearch(e.target.value)}
                className="w-full h-8 rounded-xl border border-(--card-border) bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-blue)"
            />

            {/* Governorate rows */}
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {filteredGovs.map((g) => (
                    <div
                        key={g.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                            g.capital
                                ? "bg-(--pastel-yellow) border border-(--card-border)"
                                : "hover:bg-muted/40"
                        }`}
                    >
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-foreground">{g.nameEn}</span>
                            <span className="text-xs text-muted-foreground">{g.nameAr}</span>
                            {g.capital && (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">
                                    Capital
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <input
                                type="number"
                                value={govFees[g.id] ?? ""}
                                onChange={(e) =>
                                    setGovFees((prev) => ({ ...prev, [g.id]: Number(e.target.value) }))
                                }
                                className="w-24 h-8 rounded-lg border border-(--card-border) bg-background px-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-(--pastel-mint)"
                            />
                            <span className="text-xs text-muted-foreground font-medium">IQD</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Global defaults */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-(--card-border)">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Default fee (fallback)
                    </label>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={defaultFee}
                            onChange={(e) => setDefaultFee(Number(e.target.value))}
                            className="w-full h-9 rounded-xl border border-(--card-border) bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--pastel-mint)"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">IQD</span>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Free shipping threshold
                    </label>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={freeShipping}
                            onChange={(e) => setFreeShipping(Number(e.target.value))}
                            placeholder="0 = disabled"
                            className="w-full h-9 rounded-xl border border-(--card-border) bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--pastel-mint)"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">IQD</span>
                    </div>
                </div>
            </div>

            <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold bg-(--button-success) text-white hover:bg-(--button-success-hover) disabled:opacity-50 transition-colors"
            >
                {isSaving ? "Saving..." : <><Save className="h-4 w-4" /> Save Delivery Fees</>}
            </button>
        </div>
    );
}
