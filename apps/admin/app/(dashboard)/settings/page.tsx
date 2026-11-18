"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  Settings,
  Shield,
  AlertTriangle,
  User,
  Trash2,
  Loader2,
  Building2,
} from "lucide-react";
import { LeadIndustryManager } from "@/components/leads/lead-industry-manager";
import { PaymentDetailsCard, paymentDetailsQuery } from "@/components/settings/payment-details-card";
import { DemoStoreCard } from "@/components/settings/demo-store-card";
import { SignupWhatsAppCard, signupWhatsAppQuery } from "@/components/settings/signup-whatsapp-card";
import { hasPermission } from "@/lib/admin-permissions";
import { roleLabel } from "@/lib/admin-access";
import { formatDayTime } from "@/lib/format";

// The rows of `admin_settings` are storage that other code reads (the leads
// table layout, the top-up payment details shops see): JSON objects, not text.
// Printing one as text crashed this page, so it does not list them; the one
// staff edits here (how shops pay us, WhatsApp at signup) have their own forms.

export default function SettingsPage() {
  const { user, role, isLoading } = useAdminAuth();
  // Every industries write needs it (api/industries): without it, Manage ended in a refusal.
  const canEditSettings = role ? hasPermission(role, "update_settings") : false;
  const [isIndustriesOpen, setIsIndustriesOpen] = useState(false);
  // Both are read by every staff member; start them now, not after the role.
  // In the browser only: the server render holds no session to read them with.
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.prefetchQuery(paymentDetailsQuery);
    void queryClient.prefetchQuery(signupWhatsAppQuery);
  }, [queryClient]);

  const lastLogin = user?.last_sign_in_at ? formatDayTime(user.last_sign_in_at) : "Unknown";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Settings</h1>
      </div>

      {/*
        The cards wait for the person's role: who may edit, and whether the
        demo store card is theirs, decide each card's height. Drawn earlier,
        the demo card dropped in 1.4 s later and pushed the page down. Their
        reads start above, so waiting costs no time.
      */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-foreground/70">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          <PaymentDetailsCard canEdit={canEditSettings} />

          <SignupWhatsAppCard canEdit={canEditSettings} />

          {role && hasPermission(role, "manage_demo_store") && <DemoStoreCard />}

          {/* Store industries */}
          <div className="pastel-card p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-foreground/70" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Store Industries
                  </h2>
                  <p className="text-xs text-foreground/70">
                    Categories shown in the store-creation wizard.{" "}
                    {canEditSettings ? "Add, remove, or reorder." : "Only a super admin can change them."}
                  </p>
                </div>
              </div>
              {canEditSettings && (
                <button
                  onClick={() => setIsIndustriesOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl border border-border bg-background text-xs font-semibold text-foreground transition-colors hover:bg-muted/50 shrink-0"
                >
                  Manage
                </button>
              )}
            </div>
            <p className="text-xs text-foreground/70">
              Changes take effect immediately for new merchants going through onboarding.
            </p>
          </div>

          {canEditSettings && (
            <LeadIndustryManager isOpen={isIndustriesOpen} onClose={() => setIsIndustriesOpen(false)} />
          )}

          {/* Admin users */}
          <div className="pastel-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Shield className="w-4 h-4 text-foreground/70" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Admin Users
                </h2>
                <p className="text-xs text-foreground/70">
                  Admin user management coming soon
                </p>
              </div>
            </div>

            {user ? (
              <div className="pastel-card p-4 bg-foreground/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-foreground/70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user.email}
                      </p>
                      {role && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-foreground/10 text-foreground/70 shrink-0">
                          {roleLabel(role)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground/70 mt-0.5">
                      Last login: {lastLogin}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-foreground/70">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="pastel-card p-6 border-red-200">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-500/5 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-[var(--ink-red)]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink-red)]">
                  Danger Zone
                </h2>
                <p className="text-xs text-[var(--ink-red)]">
                  Irreversible and destructive actions
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Purge Activity Logs */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-red-100 bg-red-500/5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Purge Activity Logs
                  </p>
                  <p className="text-xs text-foreground/70 mt-0.5">
                    Permanently delete all admin activity logs. This action cannot
                    be undone.
                  </p>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold opacity-40 cursor-not-allowed flex items-center gap-1.5 shrink-0 ml-4"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Purge Logs
                </button>
              </div>

              {/* Reset All Settings */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-red-100 bg-red-500/5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Reset All Settings
                  </p>
                  <p className="text-xs text-foreground/70 mt-0.5">
                    Reset all platform settings to their default values. This will
                    affect all merchants.
                  </p>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold opacity-40 cursor-not-allowed flex items-center gap-1.5 shrink-0 ml-4"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Reset Settings
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
