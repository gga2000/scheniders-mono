"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

interface ImpersonateButtonProps {
  tenantId: string;
  businessName: string;
  slug: string;
  status: string;
}

export function ImpersonateButton({
  tenantId,
  businessName,
  slug,
  status,
}: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false);

  const isCancelled = status === "cancelled";

  async function handleImpersonate() {
    const confirmed = window.confirm(
      `Impersonate ${businessName}? This action will be logged.`
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to impersonate tenant");
        return;
      }

      window.open(`http://localhost:3001/store/${slug}`, "_blank");
    } catch {
      alert("Failed to impersonate tenant. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleImpersonate}
      disabled={isCancelled || loading}
      className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--card-border)] text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-foreground/70 disabled:hover:border-[var(--card-border)]"
    >
      <Eye className="w-3.5 h-3.5" />
      {loading ? "Loading..." : "Impersonate"}
    </button>
  );
}
