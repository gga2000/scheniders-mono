"use client";

// Puts the phone's "carry on on a computer" screen in place of the app for a
// new shop's owner until the basics are done (lib/computer-setup-gate.ts).
// Everyone else gets the app untouched, at once.

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { usePhoneScreen } from "@/hooks/use-phone-screen";
import { useTenant } from "@/hooks/use-tenant";
import { toast } from "@/hooks/use-toast";
import { computerSetupGate, mayNeedComputerSetup } from "@/lib/computer-setup-gate";
import { computerOpenedHint, phoneOpenHint, rememberPhoneOpen } from "@/lib/computer-setup-hints";
import { FOUNDATION_STEPS } from "@/lib/merchant-guide/foundation";
import { useGuideProgress, useGuideShop, useSaveGuideProgress } from "@/components/merchant-guide/use-merchant-guide-data";
import { PhoneReadyScreen } from "./phone-ready-screen";
import { PhoneSetupScreen } from "./phone-setup-screen";

export function ComputerSetupGate({ children }: { children: React.ReactNode }) {
    const { t } = useLanguage();
    const { user, tenantId, role, supportView, signOut } = useAuth();
    const phone = usePhoneScreen();
    const { data: tenant } = useTenant();
    const userId = user?.id ?? null;

    const shop = tenant ? { createdAt: tenant.created_at, isDemo: tenant.is_demo } : null;
    const candidate = mayNeedComputerSetup({ phone, isAdmin: role === "admin", supportView: supportView !== null, shop });
    // This phone opened the app for this shop before, or just now: no waiting
    // screen while the server is asked. Only read on a phone (never on the server).
    const [openedNow, setOpenedNow] = useState(false);
    const hinted = candidate && tenantId !== null && phoneOpenHint(tenantId);
    const checking = candidate && !hinted && !openedNow;

    const progressQ = useGuideProgress(tenantId, userId, checking);
    const progress = progressQ.data;
    // The owner already opened the app on a phone (this one or another): the
    // shop is not watched, and this phone remembers it for next time.
    const settled = !!progress && (!!progress.phases.phone_open_at || !!progress.phases.phone_setup_at);
    useEffect(() => {
        if (checking && settled && tenantId) rememberPhoneOpen(tenantId);
    }, [checking, settled, tenantId]);
    const watching = checking && !settled;
    const shopQ = useGuideShop(tenantId, watching, watching);
    const { save, saving } = useSaveGuideProgress(tenantId, userId);

    const gate = computerSetupGate({
        phone,
        isAdmin: role === "admin",
        supportView: supportView !== null,
        shop,
        openHint: !checking,
        progress: progressQ.isPending
            ? undefined
            : progress
              ? {
                    foundationDone: !!progress.foundation_done_at,
                    phoneOpen: !!progress.phases.phone_open_at,
                    phoneSetup: !!progress.phases.phone_setup_at,
                }
              : null,
        status: shopQ.data?.status ?? null,
    });

    const openApp = (field: "phone_open_at" | "phone_setup_at") => {
        if (!tenantId) return;
        save({ phases: { ...(progress?.phases ?? {}), [field]: new Date().toISOString() } }).then(
            () => {
                rememberPhoneOpen(tenantId);
                setOpenedNow(true);
            },
            () => toast.error(t("guide.saveFailed")),
        );
    };

    if (gate === "app") return <>{children}</>;

    const status = shopQ.data?.status ?? null;
    if (gate === "ready") {
        return (
            <PhoneReadyScreen
                status={status}
                saving={saving}
                onOpen={() => openApp("phone_open_at")}
            />
        );
    }

    const computerOpen = computerOpenedHint() || (status !== null && FOUNDATION_STEPS.some((step) => status[step])) || !!progress?.answers.channel;
    return (
        <PhoneSetupScreen
            status={status}
            loadFailed={shopQ.isError && !shopQ.data}
            onRetry={() => void shopQ.refetch()}
            computerOpen={computerOpen}
            saving={saving}
            onUsePhone={() => openApp("phone_setup_at")}
            onSignOut={() => void signOut()}
        />
    );
}
