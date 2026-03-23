"use client";

import { useState, useEffect, useCallback } from "react";
import { useWaseet } from "@/hooks/use-waseet";
import { useSettings } from "@/hooks/use-settings";
import { GOVERNORATES } from "@/lib/address-validator";
import {
    Truck, CheckCircle, XCircle, Loader2, RefreshCw,
    MapPin, Save, Wifi, WifiOff, Settings2
} from "lucide-react";
import type { WaseetCity, WaseetRegion, WaseetCityMapping, WaseetPackageSize } from "@/types/waseet";

interface CityMappingRow {
    governorate_code: string;
    governorate_name_ar: string;
    waseet_city_id: number | null;
    waseet_city_name: string;
    waseet_default_region_id: number | null;
    waseet_default_region_name: string;
    regions: WaseetRegion[];
}

export function WaseetSettingsPanel() {
    const {
        fetchCities, fetchRegions, fetchPackageSizes,
        fetchCityMappings, saveCityMappings, testConnection,
    } = useWaseet();
    const { settings, updateSetting, get } = useSettings();

    // Connection state
    const [connectionStatus, setConnectionStatus] = useState<"unknown" | "connected" | "failed">("unknown");
    const [testingConnection, setTestingConnection] = useState(false);

    // Cities & Regions
    const [waseetCities, setWaseetCities] = useState<WaseetCity[]>([]);
    const [packageSizes, setPackageSizes] = useState<WaseetPackageSize[]>([]);
    const [loadingCities, setLoadingCities] = useState(false);
    const [mappings, setMappings] = useState<CityMappingRow[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Sync toggle
    const syncEnabled = get("waseet_sync_enabled") === true;

    // Default package size
    const defaultPackageSize = get("waseet_default_package_size");

    const loadExistingMappings = async (rows: CityMappingRow[]) => {
        const existing = await fetchCityMappings();
        if (existing && existing.length > 0) {
            const updated = rows.map(row => {
                const match = existing.find((m: WaseetCityMapping) => m.governorate_code === row.governorate_code);
                if (match) {
                    return {
                        ...row,
                        waseet_city_id: match.waseet_city_id,
                        waseet_city_name: match.waseet_city_name,
                        waseet_default_region_id: match.waseet_default_region_id,
                        waseet_default_region_name: match.waseet_default_region_name || "",
                    };
                }
                return row;
            });
            setMappings(updated);
        }
    };

    // Initialize mappings from our governorates
    useEffect(() => {
        const rows: CityMappingRow[] = GOVERNORATES.map(gov => ({
            governorate_code: gov.code,
            governorate_name_ar: gov.nameAr,
            waseet_city_id: null,
            waseet_city_name: "",
            waseet_default_region_id: null,
            waseet_default_region_name: "",
            regions: [],
        }));
        setMappings(rows); // eslint-disable-line react-hooks/set-state-in-effect
        loadExistingMappings(rows);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTestConnection = async () => {
        setTestingConnection(true);
        const result = await testConnection();
        setConnectionStatus(result.success ? "connected" : "failed");
        setTestingConnection(false);
    };

    const handleLoadCities = async () => {
        setLoadingCities(true);
        const [cities, sizes] = await Promise.all([
            fetchCities(),
            fetchPackageSizes(),
        ]);
        if (cities) setWaseetCities(cities);
        if (sizes) setPackageSizes(sizes);
        setLoadingCities(false);
    };

    const handleCityChange = async (govCode: string, cityId: number) => {
        const city = waseetCities.find(c => Number(c.id) === cityId);
        if (!city) return;

        // Fetch regions for this city
        const regions = await fetchRegions(cityId);

        setMappings(prev => prev.map(row => {
            if (row.governorate_code === govCode) {
                return {
                    ...row,
                    waseet_city_id: cityId,
                    waseet_city_name: city.city_name,
                    waseet_default_region_id: regions?.[0] ? Number(regions[0].id) : null,
                    waseet_default_region_name: regions?.[0]?.region_name || "",
                    regions: regions || [],
                };
            }
            return row;
        }));
    };

    const handleRegionChange = (govCode: string, regionId: number) => {
        setMappings(prev => prev.map(row => {
            if (row.governorate_code === govCode) {
                const region = row.regions.find(r => Number(r.id) === regionId);
                return {
                    ...row,
                    waseet_default_region_id: regionId,
                    waseet_default_region_name: region?.region_name || "",
                };
            }
            return row;
        }));
    };

    const handleSaveMappings = async () => {
        setSaving(true);
        setSaveMessage(null);

        const validMappings = mappings
            .filter(m => m.waseet_city_id !== null)
            .map(m => ({
                governorate_code: m.governorate_code,
                governorate_name_ar: m.governorate_name_ar,
                waseet_city_id: m.waseet_city_id!,
                waseet_city_name: m.waseet_city_name,
                waseet_default_region_id: m.waseet_default_region_id ?? undefined,
                waseet_default_region_name: m.waseet_default_region_name || undefined,
            }));

        if (validMappings.length === 0) {
            setSaveMessage("لا توجد تعيينات لحفظها");
            setSaving(false);
            return;
        }

        const result = await saveCityMappings(validMappings);
        setSaveMessage(result.success ? `تم حفظ ${validMappings.length} تعيين بنجاح` : `فشل: ${result.error}`);
        setSaving(false);
    };

    const handleToggleSync = async () => {
        await updateSetting("waseet_sync_enabled", !syncEnabled);
    };

    const handlePackageSizeChange = async (sizeId: string) => {
        const size = packageSizes.find(s => s.id === sizeId);
        if (size) {
            await updateSetting("waseet_default_package_size", { id: size.id, size: size.size });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-100">
                        <Truck className="h-5 w-5 text-cyan-700" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold">الوسيط (Al-Waseet)</h3>
                        <p className="text-xs text-muted-foreground">إعدادات شركة التوصيل</p>
                    </div>
                </div>

                {/* Connection Status */}
                <div className="flex items-center gap-2">
                    {connectionStatus === "connected" && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                            <Wifi className="h-3 w-3" /> متصل
                        </span>
                    )}
                    {connectionStatus === "failed" && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                            <WifiOff className="h-3 w-3" /> غير متصل
                        </span>
                    )}
                    <button
                        onClick={handleTestConnection}
                        disabled={testingConnection}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        {testingConnection ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        اختبار الاتصال
                    </button>
                </div>
            </div>

            {/* Auto-Sync Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
                <div>
                    <div className="text-sm font-semibold">مزامنة الحالات التلقائية</div>
                    <div className="text-xs text-muted-foreground">تحديث حالات الطلبات كل 15 دقيقة من الوسيط</div>
                </div>
                <button
                    onClick={handleToggleSync}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                        syncEnabled ? "bg-cyan-500" : "bg-gray-300"
                    }`}
                >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        syncEnabled ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                </button>
            </div>

            {/* City Mapping Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-cyan-600" />
                        تعيين المحافظات
                    </h4>
                    <button
                        onClick={handleLoadCities}
                        disabled={loadingCities}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-colors disabled:opacity-50"
                    >
                        {loadingCities ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        تحميل مدن الوسيط
                    </button>
                </div>

                {waseetCities.length === 0 ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
                        اضغط &ldquo;تحميل مدن الوسيط&rdquo; لتحميل قائمة المدن والمناطق من الوسيط أولاً
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {mappings.map((row) => (
                            <div key={row.governorate_code} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                                {/* Our governorate */}
                                <div className="w-24 shrink-0">
                                    <span className="text-xs font-bold">{row.governorate_name_ar}</span>
                                    <span className="text-[10px] text-muted-foreground block">{row.governorate_code}</span>
                                </div>

                                <span className="text-gray-300">→</span>

                                {/* Waseet city dropdown */}
                                <select
                                    value={row.waseet_city_id || ""}
                                    onChange={(e) => handleCityChange(row.governorate_code, Number(e.target.value))}
                                    className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
                                >
                                    <option value="">-- اختر المدينة --</option>
                                    {waseetCities.map(city => (
                                        <option key={city.id} value={city.id}>{city.city_name}</option>
                                    ))}
                                </select>

                                {/* Region dropdown */}
                                <select
                                    value={row.waseet_default_region_id || ""}
                                    onChange={(e) => handleRegionChange(row.governorate_code, Number(e.target.value))}
                                    disabled={!row.regions.length}
                                    className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-50"
                                >
                                    <option value="">-- المنطقة --</option>
                                    {row.regions.map(region => (
                                        <option key={region.id} value={region.id}>{region.region_name}</option>
                                    ))}
                                </select>

                                {/* Status indicator */}
                                {row.waseet_city_id ? (
                                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                ) : (
                                    <XCircle className="h-4 w-4 text-gray-300 shrink-0" />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Save button */}
                {waseetCities.length > 0 && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveMappings}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            حفظ التعيينات
                        </button>
                        {saveMessage && (
                            <span className={`text-xs font-medium ${saveMessage.includes("بنجاح") ? "text-green-600" : "text-red-600"}`}>
                                {saveMessage}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Default Package Size */}
            {packageSizes.length > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <div>
                        <div className="text-sm font-semibold flex items-center gap-1.5">
                            <Settings2 className="h-4 w-4 text-gray-500" />
                            حجم الطلب الافتراضي
                        </div>
                    </div>
                    <select
                        value={defaultPackageSize?.id || ""}
                        onChange={(e) => handlePackageSizeChange(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
                    >
                        <option value="">-- اختر --</option>
                        {packageSizes.map(size => (
                            <option key={size.id} value={size.id}>{size.size}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}
