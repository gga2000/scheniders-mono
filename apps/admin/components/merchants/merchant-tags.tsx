"use client";

import { useState } from "react";
import { Plus, X, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const TAG_COLORS: Record<string, string> = {
  VIP: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/30",
  "At Risk": "bg-red-100 text-red-800 border-red-200 dark:bg-red-400/15 dark:text-red-300 dark:border-red-400/30",
  New: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-400/15 dark:text-blue-300 dark:border-blue-400/30",
  "High Value": "bg-green-100 text-green-800 border-green-200 dark:bg-green-400/15 dark:text-green-300 dark:border-green-400/30",
  Churned: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-400/15 dark:text-gray-400 dark:border-gray-400/30",
  "Top Performer": "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-400/15 dark:text-purple-300 dark:border-purple-400/30",
};

const SUGGESTED_TAGS = Object.keys(TAG_COLORS);

interface MerchantTagsProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  compact?: boolean;
}

export function MerchantTags({ tags, onAddTag, onRemoveTag, compact }: MerchantTagsProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [custom, setCustom] = useState("");

  const availableTags = SUGGESTED_TAGS.filter((t) => !tags.includes(t));

  function handleAdd(tag: string) {
    onAddTag(tag);
    setShowAdd(false);
    setCustom("");
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border",
              TAG_COLORS[tag] || "bg-foreground/5 text-foreground/60 border-foreground/10",
            )}
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border group",
            TAG_COLORS[tag] || "bg-foreground/5 text-foreground/60 border-foreground/10",
          )}
        >
          <Tag className="w-2.5 h-2.5" />
          {tag}
          <button
            onClick={() => onRemoveTag(tag)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}

      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-foreground/30 border border-dashed border-foreground/15 hover:text-foreground/60 hover:border-foreground/30 transition-colors"
        >
          <Plus className="w-2.5 h-2.5" />
          Tag
        </button>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          {availableTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleAdd(tag)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition-all hover:scale-105",
                TAG_COLORS[tag] || "bg-foreground/5 text-foreground/60 border-foreground/10",
              )}
            >
              + {tag}
            </button>
          ))}
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) handleAdd(custom.trim());
              if (e.key === "Escape") setShowAdd(false);
            }}
            placeholder="Custom..."
            className="h-5 w-20 px-1.5 text-[10px] rounded border border-[var(--card-border)] bg-transparent text-foreground placeholder:text-foreground/30 focus:outline-none"
            autoFocus
          />
          <button onClick={() => setShowAdd(false)} className="text-[10px] text-foreground/40 hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
