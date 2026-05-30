"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useAdminUsers, type AdminUser } from "@/hooks/use-admin-users";
import { cn } from "@/lib/utils";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
}

/** Extract mentioned usernames from text (e.g. "@Ali" → ["Ali"]) */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@(\w[\w\s]*?\w|\w)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1));
}

export function MentionTextarea({
  value,
  onChange,
  onSubmit,
  placeholder = "Write a note... Use @ to mention",
  rows = 2,
  className,
  autoFocus,
}: MentionTextareaProps) {
  const { data: users } = useAdminUsers();
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [cursorStart, setCursorStart] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredUsers = (users ?? []).filter((u) =>
    u.display_name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // Detect @ trigger
  const handleInput = useCallback(
    (newValue: string) => {
      onChange(newValue);

      const textarea = textareaRef.current;
      if (!textarea) return;

      const pos = textarea.selectionStart;
      const textBefore = newValue.slice(0, pos);

      // Find the last @ that isn't preceded by a word character
      const atMatch = textBefore.match(/(^|[^@\w])@(\w*)$/);

      if (atMatch) {
        setMentionQuery(atMatch[2]);
        setCursorStart(pos - atMatch[2].length - 1);
        setShowDropdown(true);
        setSelectedIdx(0);
      } else {
        setShowDropdown(false);
      }
    },
    [onChange]
  );

  // Insert mention
  const insertMention = useCallback(
    (user: AdminUser) => {
      const before = value.slice(0, cursorStart);
      const after = value.slice(cursorStart + mentionQuery.length + 1); // +1 for @
      const newValue = `${before}@${user.display_name} ${after}`;
      onChange(newValue);
      setShowDropdown(false);

      // Restore cursor
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          const newPos = before.length + user.display_name.length + 2; // @name + space
          textarea.setSelectionRange(newPos, newPos);
          textarea.focus();
        }
      });
    },
    [value, cursorStart, mentionQuery, onChange]
  );

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % filteredUsers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + filteredUsers.length) % filteredUsers.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const user = filteredUsers[selectedIdx];
        if (user) insertMention(user);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    // Normal enter → submit (shift+enter for newline)
    if (e.key === "Enter" && !e.shiftKey && !showDropdown) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={cn(
          "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/10 resize-none",
          className
        )}
      />

      {showDropdown && filteredUsers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 bottom-full mb-1 w-56 max-h-40 overflow-y-auto bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] z-50 py-1 animate-in fade-in slide-in-from-bottom-2 duration-100"
        >
          {filteredUsers.map((user, idx) => (
            <button
              key={user.id}
              onClick={() => insertMention(user)}
              className={cn(
                "w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors",
                idx === selectedIdx
                  ? "bg-foreground/[0.06]"
                  : "hover:bg-foreground/[0.04]"
              )}
            >
              <div className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center text-[9px] font-bold text-foreground/60 shrink-0">
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">
                  {user.display_name}
                </p>
                <p className="text-[10px] text-foreground/40 truncate">
                  {user.role === "super_admin" ? "Admin" : "Support"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
