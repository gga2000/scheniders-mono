"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useCan } from "@/hooks/use-admin-auth";
import { adminFetch } from "@/lib/admin-fetch";
import { answerLostWords } from "@/lib/answer-lost";
import { failureOf, sendJson } from "@/lib/send-json";

/** Switching twice the same way changes nothing more, but look first: a colleague may have switched it. */
const SWITCH_UNSURE = answerLostWords("the switch");

const switchAnswer = z.object({ success: z.boolean().optional(), error: z.string().optional() });
const statusAnswer = z.object({ active: z.boolean() });

const UNREAD = "Could not read whether Seed Automation is on.";

export function SeedAutomationToggle() {
  const can = useCan();
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  /** The state could not be read: the switch is not offered, since "off" would be a guess. */
  const [unread, setUnread] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await adminFetch("/api/seed-automation");
      const status = statusAnswer.safeParse(res.ok ? await res.json() : null);
      setUnread(!status.success);
      if (status.success) setActive(status.data.active);
    } catch (error) {
      console.error("Seed automation status:", error);
      setUnread(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const sent = await sendJson("/api/seed-automation", { active: !active }, "POST", SWITCH_UNSURE);
      if (!sent.ok) throw failureOf(sent.status, sent.data, "Seed Automation did not switch.", SWITCH_UNSURE);
      const answer = switchAnswer.safeParse(sent.data);
      if (!answer.success || answer.data.success !== true) {
        throw new Error((answer.success && answer.data.error) || "Seed Automation did not switch.");
      }
      setActive(!active);
    } catch (error) {
      // A refused or failed switch says so; it used to be dropped without a word.
      toast.error(error instanceof Error ? error.message : "Seed Automation did not switch.");
    } finally {
      setToggling(false);
    }
  };

  // Switching needs update_settings; anyone else would only get a refusal.
  if (loading || !can("update_settings")) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={toggling || unread}
      title={unread ? UNREAD : undefined}
      aria-label={unread ? `Seed Automation: ${UNREAD}` : undefined}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border disabled:cursor-not-allowed ${
        active && !unread
          ? "bg-green-100 border-green-300 text-green-800 shadow-[0_0_10px_rgba(34,197,94,0.15)]"
          : "bg-[var(--background)] border-[var(--card-border)] text-foreground/50 hover:text-foreground/70"
      }`}
    >
      {toggling ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Bot className="w-3.5 h-3.5" />
      )}
      <span>Seed Automation</span>
      <span
        className={`w-2 h-2 rounded-full ${active && !unread ? "bg-green-500 animate-pulse" : "bg-foreground/20"}`}
      />
    </button>
  );
}
