"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  Settings,
  Shield,
  AlertTriangle,
  User,
  Key,
  Trash2,
  Loader2,
  Pencil,
  Building2,
} from "lucide-react";
import { LeadIndustryManager } from "@/components/leads/lead-industry-manager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminSetting {
  key: string;
  value: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { user, role } = useAdminAuth();
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIndustriesOpen, setIsIndustriesOpen] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to fetch settings");
        const data = await res.json();
        setSettings(data.settings ?? []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const lastLogin = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString()
    : "Unknown";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Settings
        </h1>
        <p className="text-foreground-muted mt-1">
          Manage platform configuration and admin preferences
        </p>
      </div>

      {/* Section 1: Platform Configuration */}
      <div className="pastel-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
            <Key className="w-4 h-4 text-foreground/70" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Platform Configuration
            </h2>
            <p className="text-xs text-foreground/50">
              Manage global platform settings
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-foreground/30" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-6 justify-center text-red-500">
            <AlertTriangle className="w-4 h-4" />
            <p className="text-sm">{error}</p>
          </div>
        ) : settings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-foreground/40">
            <Settings className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No settings configured</p>
            <p className="text-xs mt-1">
              Settings will appear here once they are added
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {settings.map((setting) => (
              <div
                key={setting.key}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {setting.key}
                  </p>
                  <p className="text-xs text-foreground/50 mt-0.5">
                    Updated{" "}
                    {new Date(setting.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-foreground/70 font-mono bg-foreground/5 px-2.5 py-1 rounded-lg max-w-[200px] truncate">
                    {setting.value}
                  </span>
                  <button
                    className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all"
                    title="Edit setting"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Store Industries */}
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
              <p className="text-xs text-foreground/50">
                Categories shown in the store-creation wizard. Add, remove, or reorder.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsIndustriesOpen(true)}
            className="px-3.5 py-1.5 rounded-xl border border-border bg-background text-xs font-semibold text-foreground transition-colors hover:bg-muted/50 shrink-0"
          >
            Manage
          </button>
        </div>
        <p className="text-xs text-foreground/40">
          Changes take effect immediately for new merchants going through onboarding.
        </p>
      </div>

      <LeadIndustryManager
        isOpen={isIndustriesOpen}
        onClose={() => setIsIndustriesOpen(false)}
      />

      {/* Section 3: Admin Users */}
      <div className="pastel-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
            <Shield className="w-4 h-4 text-foreground/70" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Admin Users
            </h2>
            <p className="text-xs text-foreground/50">
              Admin user management coming soon
            </p>
          </div>
        </div>

        {user ? (
          <div className="pastel-card p-4 bg-foreground/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                <User className="w-5 h-5 text-foreground/60" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {user.email}
                  </p>
                  {role && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 capitalize shrink-0">
                      {role.replace("_", " ")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground/50 mt-0.5">
                  Last login: {lastLogin}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-foreground/40">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
      </div>

      {/* Section 3: Danger Zone */}
      <div className="pastel-card p-6 border-red-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-700">
              Danger Zone
            </h2>
            <p className="text-xs text-red-500/70">
              Irreversible and destructive actions
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Purge Activity Logs */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-red-100 bg-red-50/30">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Purge Activity Logs
              </p>
              <p className="text-xs text-foreground/50 mt-0.5">
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
          <div className="flex items-center justify-between p-4 rounded-xl border border-red-100 bg-red-50/30">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Reset All Settings
              </p>
              <p className="text-xs text-foreground/50 mt-0.5">
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
    </div>
  );
}
