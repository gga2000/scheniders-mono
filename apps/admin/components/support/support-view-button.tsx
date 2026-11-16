"use client";

import { useState } from "react";
import { Copy, Eye, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { useSupportViewEnd, useSupportViewStart } from "@/hooks/use-support-cases";

/**
 * "View as merchant": the merchant's own app, look only, for 30 minutes.
 * The link signs in once; a private window keeps the staff member's own shop
 * sign-in (if any) untouched. The merchant sees every visit.
 */
export function SupportViewButton({ tenantId }: { tenantId: string }) {
  const start = useSupportViewStart();
  const end = useSupportViewEnd();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);

  const open = () =>
    start.mutate(tenantId, {
      onSuccess: (result) => setLink(result),
      onError: (error) => toast.error(error.message),
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copied. Paste it in a private window.");
    } catch {
      toast.error("Could not copy. Use Open instead.");
    }
  };

  const stop = () =>
    end.mutate(undefined, {
      onSuccess: () => {
        setLink(null);
        toast.success("Merchant view ended");
      },
      onError: (error) => toast.error(error.message),
    });

  if (!link) {
    return (
      <button
        type="button"
        disabled={start.isPending}
        onClick={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        {start.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        View as merchant
      </button>
    );
  }

  const until = new Date(link.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
      <p>
        Look only, until {until}. Nothing can be changed, and the merchant sees this visit. Use a private window if you
        are signed in to a shop in this browser.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 font-semibold text-white"
        >
          <Eye className="h-3.5 w-3.5" />
          Open
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 font-semibold"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy link
        </button>
        <button
          type="button"
          disabled={end.isPending}
          onClick={stop}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-50"
        >
          <Square className="h-3.5 w-3.5" />
          End now
        </button>
      </div>
    </div>
  );
}
