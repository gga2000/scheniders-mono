"use client";

import { useState } from "react";
import { Eye, ShieldAlert, Loader2, ExternalLink, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";

interface ImpersonateButtonProps {
  tenantId: string;
  businessName: string;
  slug: string;
  status: string;
}

const STOREFRONT_BASE =
  process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/+$/, "") ?? "http://localhost:3001/store";

export function ImpersonateButton({
  tenantId,
  businessName,
  slug,
  status,
}: ImpersonateButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCancelled = status === "cancelled";
  const isSuspended = status === "suspended";
  const targetUrl = `${STOREFRONT_BASE}/${slug}`;

  async function handleConfirm() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Failed to impersonate tenant");
        return;
      }

      window.open(targetUrl, "_blank", "noopener,noreferrer");
      setOpen(false);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isCancelled}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--card-border)] text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        title={isCancelled ? "Cannot impersonate cancelled merchants" : `View as ${businessName}`}
      >
        <Eye className="w-3.5 h-3.5" />
        Impersonate
      </button>

      <Dialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
        <DialogContent className="md:max-w-md" aria-describedby={undefined}>
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 ring-1 ring-white/20 shadow-md shadow-rose-500/30 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-foreground leading-tight">
                Impersonate {businessName}?
              </DialogTitle>
              <p className="text-xs text-foreground/55 mt-0.5">
                You'll open the merchant's storefront in a new tab as if logged in as them.
              </p>
            </div>
          </div>

          {/* Audit notice */}
          <div className="mt-4 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/30 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-snug">
              <span className="font-bold">This action is logged.</span> An entry will appear in
              the audit tab attributed to your account, with timestamp, IP, and target tenant.
            </p>
          </div>

          {/* Target preview */}
          <div className="mt-3 px-3 py-2 rounded-xl bg-foreground/[0.03] border border-[var(--card-border)] flex items-center gap-2">
            <ExternalLink className="w-3 h-3 text-foreground/40 shrink-0" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-foreground/45 shrink-0">
              Will open
            </span>
            <code className="text-[11px] text-foreground/80 font-mono truncate flex-1">
              {targetUrl}
            </code>
          </div>

          {/* Status warning */}
          {isSuspended && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-400/10 border border-rose-200 dark:border-rose-400/30">
              <p className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
                This merchant is suspended. Some features may be unavailable.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-400/10 border border-rose-200 dark:border-rose-400/30">
              <p className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
                {error}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="px-3.5 py-2 rounded-full text-xs font-bold text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-black text-white",
                "bg-gradient-to-br from-rose-500 to-red-600 ring-1 ring-white/20 shadow-sm shadow-rose-500/30",
                "hover:from-rose-400 hover:to-red-500 active:scale-95 transition-all disabled:opacity-50"
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Impersonate &amp; open
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
