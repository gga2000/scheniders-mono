"use client";

import { useSettings } from "@/hooks/use-settings";
import { useEffect, useState } from "react";
import { Save, Store, Bell, Boxes } from "lucide-react";


export function GeneralSettings() {
    const { settings, updateSetting, loading } = useSettings();
    const [profile, setProfile] = useState<any>({});
    const [inventory, setInventory] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (settings.store_profile) setProfile(settings.store_profile);
        if (settings.inventory_rules) setInventory(settings.inventory_rules);
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        await updateSetting("store_profile", profile);
        await updateSetting("inventory_rules", inventory);
        setIsSaving(false);
    };

    if (loading) return <div className="text-muted">Loading settings...</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">General Settings</h2>
                <p className="text-muted">Manage your store profile and system preferences.</p>
            </div>

            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-[var(--pastel-purple)] flex items-center justify-center">
                        <Store className="h-4 w-4 text-purple-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Store Profile</h3>
                </div>

                <div className="grid gap-4 max-w-xl">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-foreground">Store Name</label>
                        <input
                            className="flex h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                            value={profile.name || ''}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-foreground">Currency Symbol</label>
                            <input
                                className="flex h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                                value={profile.currency || ''}
                                onChange={(e) => setProfile({ ...profile, currency: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-foreground">Timezone</label>
                            <input
                                className="flex h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                                value={profile.timezone || ''}
                                onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] h-10 px-4 py-2 shadow-sm"
                        >
                            {isSaving ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
                        </button>
                    </div>
                </div>
            </div>

            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-[var(--pastel-yellow)] flex items-center justify-center">
                        <Boxes className="h-4 w-4 text-amber-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Inventory Rules</h3>
                </div>

                <div className="grid gap-4 max-w-xl">
                    <div className="flex items-center justify-between">
                        <div className="grid gap-1">
                            <label className="text-sm font-medium text-foreground">Low Stock Threshold</label>
                            <p className="text-xs text-muted">Products below this amount will be flagged.</p>
                        </div>
                        <input
                            type="number"
                            className="flex h-10 w-24 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                            value={inventory.low_stock_threshold || 5}
                            onChange={(e) => setInventory({ ...inventory, low_stock_threshold: Number(e.target.value) })}
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] h-10 px-4 py-2 shadow-sm"
                        >
                            {isSaving ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
                        </button>
                    </div>
                </div>
            </div>

            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-[var(--pastel-pink)] flex items-center justify-center">
                        <Bell className="h-4 w-4 text-rose-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="grid gap-1">
                            <label className="text-sm font-medium text-foreground">Sound Effects</label>
                            <p className="text-xs text-muted">Play sounds for new orders and success actions.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-[var(--pastel-green)] text-green-800 font-medium">Enabled</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-[var(--card-border)] pt-4">
                        <div className="grid gap-1">
                            <label className="text-sm font-medium text-foreground">Toast Popups</label>
                            <p className="text-xs text-muted">Show popup notifications at the bottom of the screen.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-[var(--pastel-green)] text-green-800 font-medium">Enabled</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

