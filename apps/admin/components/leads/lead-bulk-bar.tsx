"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronDown, UserPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/types/leads";
import { LEAD_STATUS_CONFIG } from "@/types/leads";

interface LeadBulkBarProps {
  selectedCount: number;
  onChangeStatus: (status: LeadStatus) => void;
  onAssign: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

const ALL_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "store_built",
  "converted",
  "lost",
];

export function LeadBulkBar({
  selectedCount,
  onChangeStatus,
  onAssign,
  onDelete,
  onClearSelection,
}: LeadBulkBarProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    if (statusOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [statusOpen]);

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-[#1E1E1E] text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
            {/* Selection count */}
            <span className="text-xs font-semibold whitespace-nowrap">
              {selectedCount} selected
            </span>

            {/* Divider */}
            <div className="w-px h-6 bg-white/20" />

            {/* Status dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setStatusOpen((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                Status
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    statusOpen && "rotate-180"
                  )}
                />
              </button>

              <AnimatePresence>
                {statusOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-44 bg-[#2A2A2A] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                  >
                    {ALL_STATUSES.map((status) => {
                      const config = LEAD_STATUS_CONFIG[status];
                      return (
                        <button
                          key={status}
                          onClick={() => {
                            onChangeStatus(status);
                            setStatusOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors text-left"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: config.color }}
                          />
                          {config.label}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Assign button */}
            <button
              onClick={onAssign}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Assign
            </button>

            {/* Delete button */}
            <button
              onClick={onDelete}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-red-500/20 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-white/20" />

            {/* Clear */}
            <button
              onClick={onClearSelection}
              className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs text-white/60 hover:text-white transition-colors whitespace-nowrap flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
