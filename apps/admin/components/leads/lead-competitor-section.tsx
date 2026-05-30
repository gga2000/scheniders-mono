"use client";

import { useState } from "react";
import { Plus, Trash2, Users, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadCompetitor, CompetitorRelationship } from "@/types/leads";

interface LeadCompetitorSectionProps {
  competitors: LeadCompetitor[];
  leadId: string;
}

const RELATIONSHIP_CONFIG: Record<
  CompetitorRelationship,
  { label: string; bg: string; text: string }
> = {
  direct: {
    label: "Direct",
    bg: "bg-red-500/15",
    text: "text-red-600 dark:text-red-400",
  },
  indirect: {
    label: "Indirect",
    bg: "bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
  },
  substitute: {
    label: "Substitute",
    bg: "bg-blue-500/15",
    text: "text-blue-600 dark:text-blue-400",
  },
};

const RELATIONSHIPS: CompetitorRelationship[] = [
  "direct",
  "indirect",
  "substitute",
];

function getCompetitorName(competitor: LeadCompetitor): string {
  if (competitor.competitor_lead?.merchant_name) {
    return competitor.competitor_lead.merchant_name;
  }
  if (competitor.competitor_tenant?.business_name) {
    return competitor.competitor_tenant.business_name;
  }
  return "Unknown Competitor";
}

export function LeadCompetitorSection({
  competitors,
  leadId,
}: LeadCompetitorSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  // Form state
  const [formLeadId, setFormLeadId] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [formRelationship, setFormRelationship] =
    useState<CompetitorRelationship>("direct");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleUnlink(competitorId: string) {
    setUnlinking(competitorId);
    try {
      await fetch(`/api/leads/${leadId}/competitors`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: competitorId }),
      });
      // Parent component should re-fetch after mutation
    } catch {
      // Error handling left to parent
    } finally {
      setUnlinking(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formLeadId && !formTenantId) return;

    setSubmitting(true);
    try {
      await fetch(`/api/leads/${leadId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor_lead_id: formLeadId || null,
          competitor_tenant_id: formTenantId || null,
          relationship_type: formRelationship,
          notes: formNotes || null,
        }),
      });
      // Reset form
      setFormLeadId("");
      setFormTenantId("");
      setFormRelationship("direct");
      setFormNotes("");
      setShowForm(false);
    } catch {
      // Error handling left to parent
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Competitors
          </h3>
          {competitors.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--card-border)] text-[10px] font-bold text-[var(--muted)]">
              {competitors.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((prev) => !prev)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            showForm
              ? "bg-[var(--card-border)] text-[var(--foreground)]"
              : "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
          )}
        >
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <Link2 className="w-3.5 h-3.5" />
              Link Competitor
            </>
          )}
        </button>
      </div>

      {/* Link Competitor Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3"
        >
          {/* ID inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                Lead ID
              </label>
              <input
                type="text"
                value={formLeadId}
                onChange={(e) => setFormLeadId(e.target.value)}
                placeholder="Enter lead ID..."
                className="w-full h-9 px-3 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                Tenant ID
              </label>
              <input
                type="text"
                value={formTenantId}
                onChange={(e) => setFormTenantId(e.target.value)}
                placeholder="Enter tenant ID..."
                className="w-full h-9 px-3 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
          </div>

          {/* Relationship type */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
              Relationship Type
            </label>
            <div className="flex items-center gap-2">
              {RELATIONSHIPS.map((rel) => {
                const config = RELATIONSHIP_CONFIG[rel];
                return (
                  <label
                    key={rel}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs font-medium",
                      formRelationship === rel
                        ? "border-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-[var(--card-border)] hover:border-[var(--muted)]"
                    )}
                  >
                    <input
                      type="radio"
                      name="relationship"
                      value={rel}
                      checked={formRelationship === rel}
                      onChange={() => setFormRelationship(rel)}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        formRelationship === rel
                          ? config.bg.replace("/15", "")
                          : "bg-zinc-300 dark:bg-zinc-600"
                      )}
                      style={
                        formRelationship === rel
                          ? {
                              backgroundColor:
                                rel === "direct"
                                  ? "#EF4444"
                                  : rel === "indirect"
                                    ? "#F59E0B"
                                    : "#3B82F6",
                            }
                          : undefined
                      }
                    />
                    <span className="text-[var(--foreground)]">
                      {config.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
              Notes (optional)
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Add context about this competitor relationship..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] transition-colors resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || (!formLeadId && !formTenantId)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors",
                submitting || (!formLeadId && !formTenantId)
                  ? "bg-[var(--card-border)] text-[var(--muted)] cursor-not-allowed"
                  : "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              {submitting ? "Linking..." : "Link Competitor"}
            </button>
          </div>
        </form>
      )}

      {/* Competitor list */}
      {competitors.length > 0 ? (
        <div className="space-y-2">
          {competitors.map((competitor) => {
            const name = getCompetitorName(competitor);
            const relConfig =
              RELATIONSHIP_CONFIG[competitor.relationship_type];

            return (
              <div
                key={competitor.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-[var(--card-border)] flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[var(--foreground)]">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)] truncate">
                        {name}
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap",
                          relConfig.bg,
                          relConfig.text
                        )}
                      >
                        {relConfig.label}
                      </span>
                    </div>
                    {competitor.notes && (
                      <p className="text-xs text-[var(--muted)] mt-0.5 truncate">
                        {competitor.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Unlink button */}
                <button
                  onClick={() => handleUnlink(competitor.id)}
                  disabled={unlinking === competitor.id}
                  className={cn(
                    "p-2 rounded-lg transition-colors shrink-0",
                    unlinking === competitor.id
                      ? "text-[var(--muted)] cursor-not-allowed"
                      : "text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10"
                  )}
                  aria-label={`Unlink ${name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        !showForm && (
          <div className="text-center py-10 rounded-xl border border-dashed border-[var(--card-border)]">
            <div className="w-10 h-10 rounded-full bg-[var(--card-border)] flex items-center justify-center mx-auto mb-3">
              <Users className="w-5 h-5 text-[var(--muted)]" />
            </div>
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">
              No competitors linked
            </p>
            <p className="text-xs text-[var(--muted)] max-w-xs mx-auto">
              Track competitor relationships to understand market positioning.
              Link other leads or existing merchants as direct, indirect, or
              substitute competitors.
            </p>
          </div>
        )
      )}
    </div>
  );
}
