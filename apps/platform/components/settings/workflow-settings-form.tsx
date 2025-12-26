"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkflowSettingsForm() {
    const { settings, updateSetting, loading } = useSettings();
    const [autoArchive, setAutoArchive] = useState<any>({});
    const [quickActions, setQuickActions] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (settings.auto_archive) setAutoArchive(settings.auto_archive);
        if (settings.quick_actions) setQuickActions(settings.quick_actions);
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        // Batch update? sequential for now
        await updateSetting("auto_archive", autoArchive);
        await updateSetting("quick_actions", quickActions);
        setIsSaving(false);
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Auto-Archiving</h4>
                <div className="flex items-center justify-between">
                    <Label htmlFor="archive-enabled" className="flex flex-col gap-1">
                        <span>Enable Auto-Archiving</span>
                        <span className="text-xs font-normal text-muted-foreground">Automatically clean up old orders</span>
                    </Label>
                    <Switch
                        id="archive-enabled"
                        checked={autoArchive.enabled || false}
                        onCheckedChange={c => setAutoArchive({ ...autoArchive, enabled: c })}
                    />
                </div>

                {autoArchive.enabled && (
                    <div className="space-y-2 animate-in slide-in-from-top-2">
                        <Label>Archive orders older than (days)</Label>
                        <Input
                            type="number"
                            value={autoArchive.days || 60}
                            onChange={e => setAutoArchive({ ...autoArchive, days: Number(e.target.value) })}
                        />
                    </div>
                )}
            </div>

            <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Quick Actions (Order Card)</h4>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="show-cancel"
                            checked={quickActions.show_cancel}
                            onCheckedChange={c => setQuickActions({ ...quickActions, show_cancel: c })}
                        />
                        <Label htmlFor="show-cancel">Show Cancel</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="show-reject"
                            checked={quickActions.show_reject}
                            onCheckedChange={c => setQuickActions({ ...quickActions, show_reject: c })}
                        />
                        <Label htmlFor="show-reject">Show Reject</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="show-print"
                            checked={quickActions.show_print}
                            onCheckedChange={c => setQuickActions({ ...quickActions, show_print: c })}
                        />
                        <Label htmlFor="show-print">Show Print</Label>
                    </div>
                </div>
            </div>

            <div className="pt-4">
                <Button onClick={handleSave} disabled={isSaving} size="sm">
                    {isSaving ? "Saving..." : <><Save className="h-4 w-4 mr-2" /> Save Workflow Settings</>}
                </Button>
            </div>
        </div>
    );
}
