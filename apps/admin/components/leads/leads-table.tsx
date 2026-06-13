"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Phone,
  MessageCircle,
  ChevronRight,
  GripVertical,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadStore } from "@/store/use-lead-store";
import { useLeadsTableLayout, useSaveLeadsTableLayout } from "@/hooks/use-leads-table-layout";
import {
  LEAD_COLUMN_MAP,
  CHECKBOX_COL_WIDTH,
  ACTIONS_COL_WIDTH,
  isLeadColumnId,
  type LeadColumnId,
} from "@/lib/leads-table-columns";
import {
  defaultLayout,
  cloneLayout,
  sameLayout,
  visibleColumns,
  clampColumnWidth,
  type ResolvedColumn,
  type ResolvedLayout,
} from "@/lib/leads-table-layout";
import { LEAD_CELL_RENDERERS, type LeadCellContext } from "@/components/leads/lead-columns";
import { LeadColumnsPanel } from "@/components/leads/lead-columns-panel";
import { LeadsTableEditBar } from "@/components/leads/leads-table-edit-bar";
import { LEAD_TIER_CONFIG } from "@/types/leads";
import type { Lead } from "@/types/leads";

const DND_MIME = "application/x-lead-col";

// ── Edit-mode state machine (local; ephemeral; dies on unmount) ──────────────
type EditState = { mode: "view" | "edit"; draft: ResolvedLayout | null };
type EditAction =
  | { type: "ENTER"; base: ResolvedLayout }
  | { type: "EXIT" }
  | { type: "RESET_DEFAULT" }
  | { type: "MOVE"; from: LeadColumnId; toId: LeadColumnId; before: boolean }
  | { type: "SHIFT"; id: LeadColumnId; dir: -1 | 1 }
  | { type: "RESIZE"; id: LeadColumnId; width: number }
  | { type: "TOGGLE_HIDDEN"; id: LeadColumnId };

function pinMerchant(arr: ResolvedLayout): ResolvedLayout {
  const i = arr.findIndex((c) => LEAD_COLUMN_MAP[c.id].pinnedFirst);
  if (i > 0) {
    const copy = arr.slice();
    copy.unshift(copy.splice(i, 1)[0]);
    return copy;
  }
  return arr;
}

function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "ENTER":
      return { mode: "edit", draft: cloneLayout(action.base) };
    case "EXIT":
      return { mode: "view", draft: null };
    case "RESET_DEFAULT":
      return { mode: "edit", draft: defaultLayout() };
    default:
      break;
  }
  const draft = state.draft;
  if (!draft) return state;
  switch (action.type) {
    case "MOVE": {
      const arr = draft.slice();
      const fromIdx = arr.findIndex((c) => c.id === action.from);
      if (fromIdx < 0) return state;
      const [moved] = arr.splice(fromIdx, 1);
      let toIdx = arr.findIndex((c) => c.id === action.toId);
      if (toIdx < 0) return state;
      if (!action.before) toIdx += 1;
      arr.splice(toIdx, 0, moved);
      return { ...state, draft: pinMerchant(arr) };
    }
    case "SHIFT": {
      const arr = draft.slice();
      const i = arr.findIndex((c) => c.id === action.id);
      const j = i + action.dir;
      // Index 0 is the pinned merchant — never swap into or out of it.
      if (i <= 0 || j <= 0 || j >= arr.length) return state;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...state, draft: arr };
    }
    case "RESIZE":
      return {
        ...state,
        draft: draft.map((c) => (c.id === action.id ? { ...c, width: action.width } : c)),
      };
    case "TOGGLE_HIDDEN": {
      if (LEAD_COLUMN_MAP[action.id].required) return state;
      return {
        ...state,
        draft: draft.map((c) => (c.id === action.id ? { ...c, hidden: !c.hidden } : c)),
      };
    }
    default:
      return state;
  }
}

interface LeadsTableProps {
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  onQuickCall: (lead: Lead) => void;
  onQuickWhatsApp: (lead: Lead) => void;
  /** Edit mode is owned by the parent so the entry button can live in the filter row. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

export function LeadsTable({
  leads,
  onOpenLead,
  onQuickCall,
  onQuickWhatsApp,
  editing,
  onEditingChange,
}: LeadsTableProps) {
  const { selectedLeads, toggleLead, selectAll, clearSelection } = useLeadStore();

  const layoutQuery = useLeadsTableLayout();
  const saveMutation = useSaveLeadsTableLayout();
  // Memoized so the sync effect below doesn't re-fire on every render (defaultLayout()
  // returns a fresh array each call).
  const saved = useMemo(() => layoutQuery.data ?? defaultLayout(), [layoutQuery.data]);

  const [state, dispatch] = useReducer(editReducer, { mode: "view", draft: null });

  // Keep the reducer's edit session in sync with the parent-owned `editing` flag.
  useEffect(() => {
    if (editing && state.mode !== "edit") dispatch({ type: "ENTER", base: saved });
    else if (!editing && state.mode === "edit") dispatch({ type: "EXIT" });
  }, [editing, saved, state.mode]);

  // Narrow to a local so `draft` is provably non-null in edit mode (no `!`).
  const draft = state.mode === "edit" ? state.draft : null;
  const isEditing = draft !== null;
  const activeLayout = draft ?? saved;
  const isDirty = draft !== null && !sameLayout(draft, saved);

  const visible = visibleColumns(activeLayout);
  const merchantCol = visible.find((c) => LEAD_COLUMN_MAP[c.id].pinnedFirst);
  const reorderable = visible.filter((c) => !LEAD_COLUMN_MAP[c.id].pinnedFirst);
  const tableWidth =
    CHECKBOX_COL_WIDTH +
    (merchantCol?.width ?? 0) +
    reorderable.reduce((sum, c) => sum + c.width, 0) +
    ACTIONS_COL_WIDTH;

  const cellCtx = useMemo<LeadCellContext>(
    () => ({ onQuickCall, onQuickWhatsApp }),
    [onQuickCall, onQuickWhatsApp],
  );

  // ── Drag-to-reorder (native HTML5 DnD, edit mode only) ─────────────────────
  const [draggingId, setDraggingId] = useState<LeadColumnId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: LeadColumnId; before: boolean } | null>(null);

  // ── Drag-to-resize (pointer events, rAF-coalesced) ─────────────────────────
  const resizeRef = useRef<{ id: LeadColumnId; startX: number; startW: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ id: LeadColumnId; width: number } | null>(null);
  const [resizingId, setResizingId] = useState<LeadColumnId | null>(null);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const flushResize = useCallback(() => {
    rafRef.current = null;
    const p = pendingRef.current;
    if (p) dispatch({ type: "RESIZE", id: p.id, width: p.width });
  }, []);

  const handleResizeDown = (e: ReactPointerEvent, id: LeadColumnId, startW: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { id, startX: e.clientX, startW };
    setResizingId(id);
  };
  const handleResizeMove = (e: ReactPointerEvent, id: LeadColumnId) => {
    const r = resizeRef.current;
    if (!r || r.id !== id) return;
    pendingRef.current = { id, width: clampColumnWidth(id, r.startW + (e.clientX - r.startX)) };
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushResize);
  };
  const handleResizeUp = (e: ReactPointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    resizeRef.current = null;
    setResizingId(null);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const p = pendingRef.current;
    if (p) {
      dispatch({ type: "RESIZE", id: p.id, width: p.width });
      pendingRef.current = null;
    }
  };

  const handleDragStart = (e: ReactDragEvent, id: LeadColumnId) => {
    if (resizeRef.current) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DND_MIME, id);
    setDraggingId(id);
  };
  const handleDragOver = (e: ReactDragEvent, id: LeadColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id === draggingId) {
      setDropTarget(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setDropTarget({ id, before: e.clientX < r.left + r.width / 2 });
  };
  const handleDragLeave = (id: LeadColumnId) => setDropTarget((p) => (p?.id === id ? null : p));
  const handleDrop = (e: ReactDragEvent, id: LeadColumnId) => {
    e.preventDefault();
    const from = e.dataTransfer.getData(DND_MIME);
    setDraggingId(null);
    setDropTarget(null);
    if (!isLeadColumnId(from) || from === id) return;
    const r = e.currentTarget.getBoundingClientRect();
    dispatch({ type: "MOVE", from, toId: id, before: e.clientX < r.left + r.width / 2 });
  };
  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleSave = () => {
    if (!state.draft) return;
    saveMutation.mutate(state.draft, {
      onSuccess: () => {
        onEditingChange(false);
        toast.success("Column layout saved for everyone.");
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't save the layout"),
    });
  };

  // ── Header cell (merchant is `reorderable=false`: resizable but not draggable) ──
  const renderHeader = (col: ResolvedColumn, reorder: boolean) => {
    const def = LEAD_COLUMN_MAP[col.id];
    return (
      <th
        key={col.id}
        draggable={isEditing && reorder}
        onDragStart={isEditing && reorder ? (e) => handleDragStart(e, col.id) : undefined}
        onDragOver={isEditing && reorder ? (e) => handleDragOver(e, col.id) : undefined}
        onDragLeave={isEditing && reorder ? () => handleDragLeave(col.id) : undefined}
        onDrop={isEditing && reorder ? (e) => handleDrop(e, col.id) : undefined}
        onDragEnd={isEditing && reorder ? handleDragEnd : undefined}
        className={cn(
          "relative py-2.5 px-4 text-left text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider select-none",
          isEditing && reorder && "cursor-grab active:cursor-grabbing",
          draggingId === col.id && "opacity-40",
        )}
      >
        <span className="flex items-center gap-1.5">
          {isEditing && reorder && <GripVertical className="h-3 w-3 shrink-0 opacity-50" />}
          <span className="truncate">{def.label}</span>
        </span>
        {isEditing && reorder && dropTarget?.id === col.id && (
          <span
            className={cn(
              "absolute inset-y-1 w-0.5 rounded bg-[#A78BFA]",
              dropTarget.before ? "left-0" : "right-0",
            )}
          />
        )}
        {isEditing && (
          <span
            role="presentation"
            onPointerDown={(e) => handleResizeDown(e, col.id, col.width)}
            onPointerMove={(e) => handleResizeMove(e, col.id)}
            onPointerUp={handleResizeUp}
            onLostPointerCapture={handleResizeUp}
            onDoubleClick={() =>
              dispatch({ type: "RESIZE", id: col.id, width: def.defaultWidth })
            }
            className="absolute -right-px top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-[#A78BFA]/50"
            title="Drag to resize · double-click to reset"
          />
        )}
      </th>
    );
  };

  const renderCell = (col: ResolvedColumn, lead: Lead) => {
    const def = LEAD_COLUMN_MAP[col.id];
    return (
      <td
        key={col.id}
        className={cn("py-3 px-4 overflow-hidden", def.tdClassName)}
        onClick={def.stopRowClick ? (e) => e.stopPropagation() : undefined}
      >
        {LEAD_CELL_RENDERERS[col.id](lead, cellCtx)}
      </td>
    );
  };

  const allSelected = selectedLeads.size === leads.length && leads.length > 0;

  return (
    <div>
      <div className="overflow-x-auto">
        <table
          className={cn("text-sm table-fixed", resizingId && "select-none")}
          style={{ width: tableWidth, cursor: resizingId ? "col-resize" : undefined }}
        >
          <colgroup>
            <col style={{ width: CHECKBOX_COL_WIDTH }} />
            {merchantCol && <col style={{ width: merchantCol.width }} />}
            {reorderable.map((c) => (
              <col key={c.id} style={{ width: c.width }} />
            ))}
            <col style={{ width: ACTIONS_COL_WIDTH }} />
          </colgroup>

          <thead>
            <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/40">
              <th className="py-2.5 px-4 text-left">
                <input
                  type="checkbox"
                  disabled={isEditing}
                  checked={allSelected}
                  onChange={() =>
                    allSelected ? clearSelection() : selectAll(leads.map((l) => l.id))
                  }
                  className="rounded disabled:opacity-40"
                  aria-label="Select all"
                />
              </th>
              {merchantCol && renderHeader(merchantCol, false)}
              {reorderable.map((col) => renderHeader(col, true))}
              <th className="py-2.5 px-2" />
            </tr>
          </thead>

          <tbody>
            {leads.map((lead) => {
              const tierColor = LEAD_TIER_CONFIG[lead.tier].color;
              const isWhale = lead.tier === "legendary" || lead.tier === "diamond";
              return (
                <tr
                  key={lead.id}
                  onClick={isEditing ? undefined : () => onOpenLead(lead)}
                  className={cn(
                    "group border-b border-[var(--card-border)] last:border-0 transition-colors",
                    isEditing ? "cursor-default" : "cursor-pointer",
                    lead.is_draft
                      ? "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-500/[0.06] dark:hover:bg-amber-500/[0.1]"
                      : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                  )}
                >
                  <td className="relative py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-300",
                        isWhale ? "h-7" : "h-0 group-hover:h-7",
                      )}
                      style={{ backgroundColor: tierColor }}
                    />
                    <input
                      type="checkbox"
                      disabled={isEditing}
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      className="rounded disabled:opacity-40"
                      aria-label={`Select ${lead.merchant_name}`}
                    />
                  </td>

                  {merchantCol && renderCell(merchantCol, lead)}
                  {reorderable.map((col) => renderCell(col, lead))}

                  <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onQuickCall(lead)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                        title="Call"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickWhatsApp(lead)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors"
                        title="WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {isEditing && (
          <LeadsTableEditBar
            visibleCount={visible.length}
            isDirty={isDirty}
            isSaving={saveMutation.isPending}
            columnsControl={
              <LeadColumnsPanel
                layout={activeLayout}
                onToggleHidden={(id) => dispatch({ type: "TOGGLE_HIDDEN", id })}
                onShift={(id, dir) => dispatch({ type: "SHIFT", id, dir })}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Columns
                  </button>
                }
              />
            }
            onResetDefault={() => dispatch({ type: "RESET_DEFAULT" })}
            onDiscard={() => onEditingChange(false)}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
