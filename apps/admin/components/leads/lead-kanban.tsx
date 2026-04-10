"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/types/leads";
import { LEAD_STATUS_FLOW } from "@/types/leads";
import { LeadKanbanColumn } from "@/components/leads/lead-kanban-column";

// ── Ordered columns ────────────────────────────────────────────────────

const COLUMN_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "store_built",
  "converted",
  "lost",
];

// ── Props ──────────────────────────────────────────────────────────────

interface LeadKanbanProps {
  leads: Lead[];
  onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
  onLeadClick: (leadId: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────

export function LeadKanban({
  leads,
  onStatusChange,
  onLeadClick,
}: LeadKanbanProps) {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragSourceStatus, setDragSourceStatus] = useState<LeadStatus | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null);

  // Group leads by status
  const leadsByStatus = COLUMN_ORDER.reduce<Record<LeadStatus, Lead[]>>(
    (acc, status) => {
      acc[status] = leads.filter((l) => l.status === status);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  // Determine valid targets for the currently dragged lead
  const validTargets = dragSourceStatus
    ? LEAD_STATUS_FLOW[dragSourceStatus]
    : [];

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (leadId: string, status: LeadStatus) => {
      setDraggedLeadId(leadId);
      setDragSourceStatus(status);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggedLeadId(null);
    setDragSourceStatus(null);
    setDragOverColumn(null);
  }, []);

  const handleColumnDragOver = useCallback(
    (status: LeadStatus) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(status);
    },
    []
  );

  const handleColumnDragLeave = useCallback((status: LeadStatus) => () => {
    setDragOverColumn((prev) => (prev === status ? null : prev));
  }, []);

  const handleColumnDrop = useCallback(
    (targetStatus: LeadStatus) => (e: React.DragEvent) => {
      e.preventDefault();

      const leadId = e.dataTransfer.getData("text/lead-id");
      const sourceStatus = e.dataTransfer.getData("text/lead-status") as LeadStatus;

      // Reset drag state
      setDraggedLeadId(null);
      setDragSourceStatus(null);
      setDragOverColumn(null);

      if (!leadId || !sourceStatus) return;

      // Same column -- no-op
      if (sourceStatus === targetStatus) return;

      // Validate transition
      const allowed = LEAD_STATUS_FLOW[sourceStatus];
      if (!allowed.includes(targetStatus)) return;

      onStatusChange(leadId, targetStatus);
    },
    [onStatusChange]
  );

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {/* Scrollable horizontal container */}
      <div
        className={cn(
          "flex gap-3 overflow-x-auto pb-4",
          "scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700"
        )}
      >
        {COLUMN_ORDER.map((status) => {
          const isDragActive = draggedLeadId !== null;
          const isOver = dragOverColumn === status;
          const isSource = dragSourceStatus === status;
          const isValid = validTargets.includes(status);

          return (
            <LeadKanbanColumn
              key={status}
              status={status}
              leads={leadsByStatus[status]}
              isDropTarget={isDragActive && isOver && !isSource}
              isValidTarget={isValid}
              onDragOver={handleColumnDragOver(status)}
              onDragLeave={handleColumnDragLeave(status)}
              onDrop={handleColumnDrop(status)}
              onLeadClick={onLeadClick}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          );
        })}
      </div>
    </div>
  );
}
