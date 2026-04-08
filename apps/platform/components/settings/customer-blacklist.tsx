"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { ShieldBan, Plus, Trash2, Phone, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BlacklistEntry {
    phone: string;
    reason: string;
    added_at: string;
}

export function CustomerBlacklist() {
    const { settings, updateSetting, loading } = useSettings();
    const [entries, setEntries] = useState<BlacklistEntry[]>([]);
    const [phone, setPhone] = useState("");
    const [reason, setReason] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [phoneError, setPhoneError] = useState("");

    const s = settings as Record<string, any>;

    useEffect(() => {
        if (s.customer_blacklist) {
            setEntries(s.customer_blacklist);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [(settings as Record<string, any>).customer_blacklist]);

    const validatePhone = (p: string): string => {
        if (!p.startsWith("07") || (p.length < 10 || p.length > 11)) {
            return "Phone must start with 07 and be 10–11 digits";
        }
        if (entries.some((e) => e.phone === p)) {
            return "This number is already blacklisted";
        }
        return "";
    };

    const handleAdd = async () => {
        const trimmedPhone = phone.trim();
        const trimmedReason = reason.trim();
        const err = validatePhone(trimmedPhone);
        if (err) { setPhoneError(err); return; }
        if (!trimmedReason) { setPhoneError("Please provide a reason"); return; }

        setIsAdding(true);
        const newEntry: BlacklistEntry = {
            phone: trimmedPhone,
            reason: trimmedReason,
            added_at: new Date().toISOString().split("T")[0],
        };
        const newList = [...entries, newEntry];
        const result = await updateSetting("customer_blacklist", newList);
        if (result.success) {
            setEntries(newList);
            setPhone("");
            setReason("");
            setPhoneError("");
            toast.success("Customer blacklisted");
        } else {
            toast.error("Failed to save blacklist");
        }
        setIsAdding(false);
    };

    const handleRemove = async (phoneToRemove: string) => {
        const newList = entries.filter((e) => e.phone !== phoneToRemove);
        const result = await updateSetting("customer_blacklist", newList);
        if (result.success) {
            setEntries(newList);
            toast.success("Removed from blacklist");
        } else {
            toast.error("Failed to update blacklist");
        }
    };

    if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Customer Blacklist</h2>
                <p className="text-sm text-muted-foreground">Block phone numbers from placing orders.</p>
            </div>

            {/* Add Form */}
            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-pink) flex items-center justify-center">
                        <ShieldBan className="h-4 w-4 text-rose-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Add to Blacklist</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Phone Number
                        </label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                type="tel"
                                placeholder="07XXXXXXXX"
                                value={phone}
                                onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }}
                                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                className="w-full h-9 pl-8 pr-3 rounded-xl border border-(--card-border) bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-pink) focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Reason
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Fake orders, no-show..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                            className="w-full h-9 px-3 rounded-xl border border-(--card-border) bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-pink) focus:border-transparent"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={handleAdd}
                            disabled={isAdding}
                            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all whitespace-nowrap"
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </button>
                    </div>
                </div>

                {phoneError && (
                    <p className="flex items-center gap-1.5 mt-2 text-xs text-rose-600">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {phoneError}
                    </p>
                )}
            </div>

            {/* Blacklist Table */}
            <div className="pastel-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-foreground">
                        Blacklisted Numbers
                        {entries.length > 0 && (
                            <span className="ml-2 text-xs font-semibold text-rose-700 bg-(--pastel-pink) px-2 py-0.5 rounded-full">
                                {entries.length}
                            </span>
                        )}
                    </h3>
                </div>

                {entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-(--pastel-green) flex items-center justify-center mb-4">
                            <ShieldBan className="h-8 w-8 text-green-600" />
                        </div>
                        <p className="font-semibold text-foreground">All clear!</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            No customers are currently blacklisted.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {entries.map((entry) => (
                            <div
                                key={entry.phone}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-(--pastel-pink-light) border border-(--card-border) hover:bg-(--pastel-pink) transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-(--pastel-pink) flex items-center justify-center shrink-0">
                                    <Phone className="h-3.5 w-3.5 text-rose-700" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-mono font-medium text-foreground">
                                        {entry.phone}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">{entry.reason}</p>
                                </div>
                                <div className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                                    {entry.added_at}
                                </div>
                                <button
                                    onClick={() => handleRemove(entry.phone)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-rose-100 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                                    aria-label="Remove from blacklist"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
