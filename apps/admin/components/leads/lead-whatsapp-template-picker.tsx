"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useOutreachTemplates } from "@/hooks/use-outreach-templates";
import type { OutreachTemplate, Lead } from "@/types/leads";
import { LEAD_STATUS_CONFIG } from "@/types/leads";
import type { LeadStatus } from "@/types/leads";
import { EASE_CHROME } from "@/lib/animation-constants";
import {
  X,
  MessageCircle,
  Send,
  Copy,
  Check,
  ChevronLeft,
  ExternalLink,
  FileText,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface LeadWhatsAppTemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onSend: (message: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

function replacePlaceholders(template: string, lead: Lead): string {
  const storeLink = `scheniders.com/${lead.merchant_name.toLowerCase().replace(/\s+/g, "-")}`;
  return template
    .replace(/\{\{merchant_name\}\}/g, lead.merchant_name)
    .replace(/\{\{store_link\}\}/g, storeLink)
    .replace(/\{\{platform\}\}/g, lead.platform)
    .replace(/\{\{follower_count\}\}/g, lead.follower_count.toLocaleString())
    .replace(/\{\{management_name\}\}/g, lead.management_name || "")
    .replace(/\{\{city\}\}/g, lead.city || "");
}

function highlightPlaceholders(text: string): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) => {
    if (part.startsWith("{{") && part.endsWith("}}")) {
      return (
        <span key={i} className="text-[var(--primary)] font-semibold">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const ALL_STATUSES: LeadStatus[] = ["new", "contacted", "interested", "store_built", "converted", "lost"];

// ── Component ──────────────────────────────────────────────────────────

export function LeadWhatsAppTemplatePicker({
  isOpen,
  onClose,
  lead,
  onSend,
}: LeadWhatsAppTemplatePickerProps) {
  const { data: templates } = useOutreachTemplates();
  const [selectedStage, setSelectedStage] = useState<LeadStatus | "all">("all");
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplate | null>(null);
  const [editedMessage, setEditedMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSelectedStage(lead.status);
      setSelectedTemplate(null);
      setEditedMessage("");
      setCopied(false);
    }
  }, [isOpen, lead.status]);

  // When template is selected, fill in the message
  useEffect(() => {
    if (selectedTemplate) {
      setEditedMessage(replacePlaceholders(selectedTemplate.message_template, lead));
    }
  }, [selectedTemplate, lead]);

  // Filter templates by stage
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const active = templates.filter((t) => t.is_active);
    if (selectedStage === "all") return active;
    return active.filter((t) => t.stage === selectedStage);
  }, [templates, selectedStage]);

  // Handlers
  const handleSendWhatsApp = useCallback(() => {
    const phone = lead.page_phone?.replace(/[^0-9+]/g, "") || "";
    const encoded = encodeURIComponent(editedMessage);
    const url = `https://wa.me/${phone}?text=${encoded}`;
    window.open(url, "_blank");
    onSend(editedMessage);
  }, [lead.page_phone, editedMessage, onSend]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = editedMessage;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [editedMessage]);

  const handleBackToList = () => {
    setSelectedTemplate(null);
    setEditedMessage("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Slide-over Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: EASE_CHROME }}
            className="fixed right-0 top-0 bottom-0 z-[201] w-full max-w-md flex flex-col border-l border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-3">
                {selectedTemplate && (
                  <button
                    onClick={handleBackToList}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors mr-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--foreground)]">
                    {selectedTemplate ? "Preview Message" : "WhatsApp Templates"}
                  </h2>
                  <p className="text-[11px] text-[var(--muted)]">
                    {lead.merchant_name}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Content ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {!selectedTemplate ? (
                  /* ── Template List View ──────────────────────── */
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15, ease: EASE_CHROME }}
                    className="flex flex-col h-full"
                  >
                    {/* Stage Tabs */}
                    <div className="px-5 pt-4 pb-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setSelectedStage("all")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                            selectedStage === "all"
                              ? "bg-[var(--foreground)] text-[var(--card-bg)]"
                              : "text-[var(--muted)] hover:bg-[var(--foreground)]/5"
                          )}
                        >
                          All
                        </button>
                        {ALL_STATUSES.map((status) => {
                          const config = LEAD_STATUS_CONFIG[status];
                          const isActive = selectedStage === status;
                          const isCurrentStatus = status === lead.status;
                          return (
                            <button
                              key={status}
                              onClick={() => setSelectedStage(status)}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                                isActive
                                  ? "text-white"
                                  : "hover:bg-[var(--foreground)]/5"
                              )}
                              style={{
                                backgroundColor: isActive ? config.color : undefined,
                                color: isActive ? "#000" : config.color,
                                outline: isCurrentStatus && !isActive
                                  ? `1.5px solid ${config.color}`
                                  : undefined,
                              }}
                            >
                              {config.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Template Cards */}
                    <div className="flex-1 px-5 py-3 space-y-2.5">
                      {filteredTemplates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-[var(--foreground)]/5 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-[var(--muted)]" />
                          </div>
                          <p className="text-sm font-semibold text-[var(--muted)]">
                            No templates for this stage
                          </p>
                          <p className="text-xs text-[var(--muted)]/70 text-center max-w-[200px]">
                            Create outreach templates in settings to start using them here
                          </p>
                        </div>
                      ) : (
                        filteredTemplates.map((template) => {
                          const stageConfig = LEAD_STATUS_CONFIG[template.stage];
                          const preview = template.message_template.slice(0, 100);
                          return (
                            <motion.div
                              key={template.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.15 }}
                              className="rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.01] overflow-hidden hover:border-[var(--foreground)]/15 transition-colors"
                            >
                              <div className="px-4 py-3">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-[var(--foreground)] truncate">
                                      {template.name}
                                    </h4>
                                    <span
                                      className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                      style={{
                                        backgroundColor: stageConfig.bgColor,
                                        color: stageConfig.color,
                                      }}
                                    >
                                      {stageConfig.label}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-[var(--muted)] leading-relaxed line-clamp-2">
                                  {highlightPlaceholders(
                                    preview + (template.message_template.length > 100 ? "..." : "")
                                  )}
                                </p>
                                <button
                                  onClick={() => setSelectedTemplate(template)}
                                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  Use Template
                                </button>
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                ) : (
                  /* ── Preview View ────────────────────────────── */
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15, ease: EASE_CHROME }}
                    className="px-5 py-5 space-y-5"
                  >
                    {/* Template Info */}
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--card-border)]">
                      <MessageCircle className="w-4 h-4 text-[var(--muted)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--foreground)] truncate">
                          {selectedTemplate.name}
                        </p>
                        <span
                          className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                          style={{
                            backgroundColor: LEAD_STATUS_CONFIG[selectedTemplate.stage].bgColor,
                            color: LEAD_STATUS_CONFIG[selectedTemplate.stage].color,
                          }}
                        >
                          {LEAD_STATUS_CONFIG[selectedTemplate.stage].label}
                        </span>
                      </div>
                    </div>

                    {/* Editable Message */}
                    <div>
                      <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                        Message
                      </label>
                      <textarea
                        value={editedMessage}
                        onChange={(e) => setEditedMessage(e.target.value)}
                        rows={10}
                        className="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm leading-relaxed placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow resize-none"
                        placeholder="Type your message..."
                      />
                    </div>

                    {/* Phone Info */}
                    {lead.page_phone ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                        <Send className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          Sending to <strong>{lead.page_phone}</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20">
                        <Send className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          No phone number on file. The WhatsApp link will open without a recipient.
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleSendWhatsApp}
                        disabled={!editedMessage.trim()}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                          "bg-emerald-600 text-white hover:bg-emerald-700",
                          "disabled:opacity-40 disabled:cursor-not-allowed"
                        )}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Send via WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className={cn(
                          "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                          copied
                            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-500"
                            : "border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                        )}
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
