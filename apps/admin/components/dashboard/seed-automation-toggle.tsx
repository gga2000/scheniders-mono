"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, Loader2 } from "lucide-react";

export function SeedAutomationToggle() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/seed-automation");
      const data = await res.json();
      setActive(data.active ?? false);
    } catch {
      setActive(false);
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
      const res = await fetch("/api/seed-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      const data = await res.json();
      if (data.success) {
        setActive(!active);
      }
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  if (loading) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={toggling}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
        active
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
        className={`w-2 h-2 rounded-full ${active ? "bg-green-500 animate-pulse" : "bg-foreground/20"}`}
      />
    </button>
  );
}
