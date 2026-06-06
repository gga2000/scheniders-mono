"use client";
import { useEffect } from "react";

export function ExperimentBeacon({
  tenantId,
  arms,
}: {
  tenantId: string;
  arms: Record<string, string>;
}) {
  useEffect(() => {
    const entries = Object.entries(arms);
    if (entries.length === 0) return;

    for (const [experiment_id, arm_id] of entries) {
      const key = `exp_view:${tenantId}:${experiment_id}:${arm_id}`;
      let alreadyRecorded = false;
      try {
        if (localStorage.getItem(key)) {
          alreadyRecorded = true;
        } else {
          localStorage.setItem(key, "1");
        }
      } catch {
        // localStorage unavailable — still fire once per mount
      }

      if (alreadyRecorded) continue;

      void fetch("/api/exp-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, experiment_id, arm_id, event_type: "view" }),
        keepalive: true,
      }).catch(() => {
        // fire-and-forget beacon — ignore network errors
      });
    }
  }, [tenantId, arms]);

  return null;
}
