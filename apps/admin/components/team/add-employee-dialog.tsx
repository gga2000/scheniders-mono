"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { UserPlus, X, Loader2, Shield, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAddAdminUser } from "@/hooks/use-admin-user-mutations";
import type { AdminRole } from "@/types/admin";

interface AddEmployeeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: AdminRole; label: string; hint: string; icon: typeof Shield }[] = [
  {
    value: "support_staff",
    label: "Support staff",
    hint: "Trials, notes, notifications, impersonate, export",
    icon: LifeBuoy,
  },
  {
    value: "super_admin",
    label: "Super admin",
    hint: "Full control — wallets, plans, suspend, settings",
    icon: Shield,
  },
];

export function AddEmployeeDialog({ isOpen, onClose }: AddEmployeeDialogProps) {
  const addAdminUser = useAddAdminUser();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("support_staff");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setDisplayName("");
      setAdminRole("support_staff");
      setPassword("");
      addAdminUser.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = () => {
    addAdminUser.mutate(
      {
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        adminRole,
        password: password || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Admin employee added");
          onClose();
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  const canSubmit = email.trim().length > 3 && !addAdminUser.isPending;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <h2 className="text-lg font-bold text-[var(--foreground)]">
                    Add admin employee
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="person@example.com"
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    Display name (optional)
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Noor"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    Access level
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {ROLE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = adminRole === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAdminRole(opt.value)}
                          className={cn(
                            "flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors",
                            active
                              ? "border-[var(--primary)] bg-[var(--primary)]/5"
                              : "border-[var(--card-border)] hover:bg-[var(--foreground)]/[0.03]",
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-4 h-4 mt-0.5 shrink-0",
                              active ? "text-[var(--primary)]" : "text-[var(--muted)]",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--foreground)]">
                              {opt.label}
                            </p>
                            <p className="text-[11px] text-[var(--muted)] leading-snug">
                              {opt.hint}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars — only for a brand-new email"
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />
                  <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-snug">
                    Leave blank to add an existing main-app user — they keep their
                    current password. A password is required only when the email
                    has no account yet (or to reset an existing one).
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                    "bg-[#1E1E1E] text-white hover:bg-[#2D2D2D]",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                >
                  {addAdminUser.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  Add employee
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
