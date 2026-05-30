"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useAdminStore } from "@/store/use-admin-store";

export function MerchantSearchInput() {
  const { searchQuery, setSearchQuery } = useAdminStore();
  const { searches, addSearch, removeSearch, clearAll } = useRecentSearches();
  const [localValue, setLocalValue] = useState(searchQuery);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync external changes
  useEffect(() => {
    setLocalValue(searchQuery);
  }, [searchQuery]);

  // Debounced search
  const handleChange = useCallback(
    (val: string) => {
      setLocalValue(val);
      setHighlightIdx(-1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchQuery(val);
        if (val.trim()) addSearch(val.trim());
      }, 300);
    },
    [setSearchQuery, addSearch]
  );

  // Submit on enter
  const handleSubmit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery(localValue);
    if (localValue.trim()) addSearch(localValue.trim());
    setIsFocused(false);
    inputRef.current?.blur();
  }, [localValue, setSearchQuery, addSearch]);

  // Apply suggestion
  const applySuggestion = useCallback(
    (query: string) => {
      setLocalValue(query);
      setSearchQuery(query);
      setIsFocused(false);
      inputRef.current?.blur();
    },
    [setSearchQuery]
  );

  // Clear
  const handleClear = useCallback(() => {
    setLocalValue("");
    setSearchQuery("");
    inputRef.current?.focus();
  }, [setSearchQuery]);

  // Click outside
  useEffect(() => {
    if (!isFocused) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isFocused]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (highlightIdx >= 0 && highlightIdx < filteredSearches.length) {
        applySuggestion(filteredSearches[highlightIdx]);
      } else {
        handleSubmit();
      }
    } else if (e.key === "Escape") {
      setIsFocused(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, filteredSearches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, -1));
    }
  };

  // Filter suggestions
  const filteredSearches = localValue
    ? searches.filter((s) => s.toLowerCase().includes(localValue.toLowerCase()) && s !== localValue)
    : searches;

  const showDropdown = isFocused && filteredSearches.length > 0;

  return (
    <div className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
        <input
          ref={inputRef}
          type="text"
          data-merchant-search
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search merchants..."
          className={cn(
            "w-full pl-9 pr-8 py-2 rounded-xl text-sm border transition-all bg-[var(--card-bg)]",
            isFocused
              ? "border-foreground/20 ring-2 ring-foreground/5"
              : "border-[var(--card-border)]",
            "placeholder:text-foreground/30 text-foreground"
          )}
        />
        {localValue && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60 transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Recent searches dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--card-border)]">
            <span className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
              Recent Searches
            </span>
            {filteredSearches.length > 0 && (
              <button
                onClick={() => { clearAll(); setIsFocused(false); }}
                className="text-[10px] text-foreground/40 hover:text-foreground/60 transition-colors flex items-center gap-0.5"
              >
                <Trash2 className="w-2.5 h-2.5" />
                Clear
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredSearches.map((query, idx) => (
              <div
                key={query}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
                  highlightIdx === idx
                    ? "bg-foreground/[0.05]"
                    : "hover:bg-foreground/[0.03]"
                )}
                onClick={() => applySuggestion(query)}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                <Clock className="w-3 h-3 text-foreground/30 shrink-0" />
                <span className="text-sm text-foreground/70 truncate flex-1">{query}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSearch(query);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-foreground/30 hover:text-foreground/60 transition-all"
                  aria-label={`Remove "${query}"`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
