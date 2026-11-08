"use client";

import { useLanguage } from "@/hooks/use-language";
import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { Switch } from "@scheniders/ui/switch";
import { Label } from "@scheniders/ui/label";
import { Input } from "@scheniders/ui/input";
import { Save } from "lucide-react";
import { Button } from "@scheniders/ui/button";
import { toast } from "@/hooks/use-toast";

export function WorkflowSettingsForm() {
    const { settings, updateSetting, loading } = useSettings();
    const { t } = useLanguage();
    const [autoArchive, setAutoArchive] = useState<any>({});
    const [quickActions, setQuickActions] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (settings.auto_archive) setAutoArchive(settings.auto_archive);
        if (settings.quick_actions) setQuickActions(settings.quick_actions);
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        const results = await Promise.all([
            updateSetting("auto_archive", autoArchive),
            updateSetting("quick_actions", quickActions)
        ]);
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            toast.error(t("settings.workflow.saveFailed"), failed.map(r => r.error).join(", "));
        } else {
            toast.success(t("settings.workflow.saved"));
        }
        setIsSaving(false);
    };

    if (loading) return <div>{t("common.loading")}</div>;

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("settings.workflow.archive")}</h4>
                <div className="flex items-center justify-between">
                    <Label htmlFor="archive-enabled" className="flex flex-col gap-1">
                        <span>{t("settings.workflow.archiveOn")}</span>
                        <span className="text-xs font-normal text-muted-foreground">{t("settings.workflow.archiveHint")}</span>
                    </Label>
                    <Switch
                        id="archive-enabled"
                        checked={autoArchive.enabled || false}
                        onCheckedChange={c => setAutoArchive({ ...autoArchive, enabled: c })}
                    />
                </div>

                {autoArchive.enabled && (
                    <div className="space-y-2 animate-in slide-in-from-top-2">
                        <Label>{t("settings.workflow.archiveDays")}</Label>
                        <Input
                            type="number"
                            value={autoArchive.days || 60}
                            onChange={e => setAutoArchive({ ...autoArchive, days: Number(e.target.value) })}
                        />
                    </div>
                )}
            </div>

            <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("settings.workflow.quick")}</h4>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="show-cancel"
                            checked={quickActions.show_cancel}
                            onCheckedChange={c => setQuickActions({ ...quickActions, show_cancel: c })}
                        />
                        <Label htmlFor="show-cancel">{t("settings.workflow.showCancel")}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="show-reject"
                            checked={quickActions.show_reject}
                            onCheckedChange={c => setQuickActions({ ...quickActions, show_reject: c })}
                        />
                        <Label htmlFor="show-reject">{t("settings.workflow.showReject")}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="show-print"
                            checked={quickActions.show_print}
                            onCheckedChange={c => setQuickActions({ ...quickActions, show_print: c })}
                        />
                        <Label htmlFor="show-print">{t("settings.workflow.showPrint")}</Label>
                    </div>
                </div>
            </div>

            <div className="pt-4">
                <Button onClick={handleSave} disabled={isSaving} size="sm">
                    {isSaving ? t("common.saving") : <><Save className="h-4 w-4 mr-2" /> {t("settings.workflow.save")}</>}
                </Button>
            </div>
        </div>
    );
}
