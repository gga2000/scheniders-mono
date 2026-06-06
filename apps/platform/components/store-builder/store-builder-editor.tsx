"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Monitor, PenLine } from "lucide-react";
import { useStoreBuilder } from "@/hooks/use-store-builder";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { StoreBuilderHeader, type PreviewDevice } from "./store-builder-header";
import { StoreStatusBanner } from "./store-status-banner";
import { ShareQrDialog } from "./share-qr-dialog";
import { EditorPanel } from "./editor-panel";
import { cn } from "@/lib/utils";

// Lazy-load the preview panel to keep the editor fast
const PreviewPanel = dynamic(
    () => import("./preview-panel").then((mod) => ({ default: mod.PreviewPanel })),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 flex items-center justify-center bg-muted/30">
                <div className="text-muted-foreground text-sm">Loading preview...</div>
            </div>
        ),
    }
);

interface StoreBuilderEditorProps {
    tenant: {
        id: string;
        slug: string;
        business_name: string;
        status?: string;
        store_config: Record<string, unknown> | null;
    };
    tenantId: string;
}

export function StoreBuilderEditor({ tenant, tenantId }: StoreBuilderEditorProps) {
    const builder = useStoreBuilder({
        tenantId,
        initialConfig: (tenant.store_config || {}) as any,
        initialBusinessName: tenant.business_name,
        slug: tenant.slug,
    });

    const storefrontUrl = useStorefrontUrl(tenant.slug, tenantId);
    const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
    const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
    const [shareOpen, setShareOpen] = useState(false);

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Store status banner (trial/suspended) */}
            <StoreStatusBanner status={(tenant.status as "active" | "trial" | "suspended" | "cancelled") || "active"} />

            {/* Header */}
            <StoreBuilderHeader
                saveStatus={builder.saveStatus}
                isDirty={builder.isDirty}
                canUndo={builder.canUndo}
                canRedo={builder.canRedo}
                onUndo={builder.undo}
                onRedo={builder.redo}
                onSave={builder.save}
                onPublish={builder.publish}
                onRevert={builder.revert}
                hasPublished={!!tenant.store_config}
                previewDevice={previewDevice}
                setPreviewDevice={setPreviewDevice}
                storefrontUrl={storefrontUrl}
                businessName={builder.businessName}
                onShareClick={() => setShareOpen(true)}
            />

            {/* Share QR Dialog */}
            <ShareQrDialog
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                storeUrl={storefrontUrl}
                businessName={tenant.business_name}
            />

            {/* Mobile view toggle */}
            <div className="lg:hidden flex border-b border-(--card-border) bg-(--card-bg)">
                <button
                    onClick={() => setMobileView("editor")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
                        mobileView === "editor"
                            ? "text-foreground border-b-2 border-primary"
                            : "text-muted-foreground"
                    )}
                >
                    <PenLine className="w-4 h-4" />
                    Editor
                </button>
                <button
                    onClick={() => setMobileView("preview")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
                        mobileView === "preview"
                            ? "text-foreground border-b-2 border-primary"
                            : "text-muted-foreground"
                    )}
                >
                    <Monitor className="w-4 h-4" />
                    Preview
                </button>
            </div>

            {/* Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Editor Panel — Left */}
                <EditorPanel
                    builder={builder}
                    tenantId={tenantId}
                    businessName={tenant.business_name}
                    storeUrl={storefrontUrl}
                    slug={tenant.slug}
                    className={cn(
                        "w-full lg:w-1/2 xl:w-[45%] border-r border-(--card-border)",
                        mobileView !== "editor" && "hidden lg:block"
                    )}
                />

                {/* Preview Panel — Right */}
                <div className={cn(
                    "flex-1",
                    mobileView !== "preview" && "hidden lg:block"
                )}>
                    <PreviewPanel
                        config={builder.config}
                        businessName={builder.businessName}
                        device={previewDevice}
                        storefrontUrl={storefrontUrl}
                    />
                </div>
            </div>

            {/* Onboarding Tour — disabled: auto-scroll + overlay causes poor UX
            <OnboardingTour tenantId={tenantId} />
            */}
        </div>
    );
}
