"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

export function DeliveryFeesForm() {
    const { settings, updateSetting, loading } = useSettings();
    const [fees, setFees] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (settings.delivery_fees) {
            setFees(settings.delivery_fees);
        }
    }, [settings.delivery_fees]);

    const handleSave = async () => {
        setIsSaving(true);
        await updateSetting("delivery_fees", fees);
        setIsSaving(false);
    };

    if (loading) return <div className="text-sm">Loading...</div>;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Baghdad (IQD)</Label>
                    <Input
                        type="number"
                        value={fees.baghdad || ""}
                        onChange={e => setFees({ ...fees, baghdad: Number(e.target.value) })}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Governorates (IQD)</Label>
                    <Input
                        type="number"
                        value={fees.provinces || ""}
                        onChange={e => setFees({ ...fees, provinces: Number(e.target.value) })}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Default (IQD)</Label>
                    <Input
                        type="number"
                        value={fees.default || ""}
                        onChange={e => setFees({ ...fees, default: Number(e.target.value) })}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Free Shipping Threshold (IQD)</Label>
                    <Input
                        type="number"
                        value={fees.free_shipping_threshold || ""}
                        onChange={e => setFees({ ...fees, free_shipping_threshold: Number(e.target.value) })}
                        placeholder="0 to disable"
                    />
                </div>
            </div>

            <Button onClick={handleSave} disabled={isSaving} size="sm" className="w-full">
                {isSaving ? "Saving..." : <><Save className="h-4 w-4 mr-2" /> Save Fees</>}
            </Button>
        </div>
    );
}
