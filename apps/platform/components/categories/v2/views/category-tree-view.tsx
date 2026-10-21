"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Category, CategoryScope } from "@scheniders/shared";
import { CategoryRow } from "../category-row";
import { useCategoryStore } from "@/store/use-category-store";
import type { ReorderEntry } from "@/hooks/use-categories-query";

interface CategoryTreeViewProps {
  categories: Category[];
  productCountMap: Record<string, number>;
  onEdit: (c: Category) => void;
  onDuplicate: (c: Category) => void;
  onArchive: (c: Category) => void;
  onDelete: (c: Category) => void;
  onToggleVisibility: (c: Category) => void;
  onScopeChange: (c: Category, scope: CategoryScope) => void;
  onOpenDetail?: (c: Category) => void;
  onReorder: (entries: ReorderEntry[]) => void;
}

interface TreeNode {
  category: Category;
  depth: number;
  children: TreeNode[];
}

function buildTree(categories: Category[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  categories.forEach((c) => byId.set(c.id, { category: c, depth: 0, children: [] }));
  const roots: TreeNode[] = [];
  byId.forEach((node) => {
    const parent = node.category.parent_id ? byId.get(node.category.parent_id) : null;
    if (parent) {
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.category.display_order - b.category.display_order);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function flatten(
  nodes: TreeNode[],
  expanded: Set<string>,
  out: TreeNode[] = [],
): TreeNode[] {
  nodes.forEach((n) => {
    out.push(n);
    if (expanded.has(n.category.id) && n.children.length > 0) {
      flatten(n.children, expanded, out);
    }
  });
  return out;
}

export function CategoryTreeView({
  categories,
  productCountMap,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleVisibility,
  onScopeChange,
  onOpenDetail,
  onReorder,
}: CategoryTreeViewProps) {
  const expandedIds = useCategoryStore((s) => s.expandedIds);
  const toggleExpanded = useCategoryStore((s) => s.toggleExpanded);
  const selectedIds = useCategoryStore((s) => s.selectedIds);
  const toggleSelected = useCategoryStore((s) => s.toggleSelected);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);
  const flatRows = useMemo(() => flatten(tree, expandedSet), [tree, expandedSet]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = e;
      if (!over || active.id === over.id) return;

      const activeNode = flatRows.find((r) => r.category.id === active.id);
      const overNode = flatRows.find((r) => r.category.id === over.id);
      if (!activeNode || !overNode) return;

      // Reparent to over node's parent, insert at over node's position.
      const newParent = overNode.category.parent_id;
      const siblings = categories
        .filter((c) => c.parent_id === newParent && c.id !== activeNode.category.id)
        .sort((a, b) => a.display_order - b.display_order);
      const overIdx = siblings.findIndex((s) => s.id === over.id);
      const reordered = [...siblings];
      reordered.splice(Math.max(0, overIdx), 0, activeNode.category);

      const entries: ReorderEntry[] = reordered.map((c, idx) => ({
        id: c.id,
        parent_id: c.id === activeNode.category.id ? newParent : c.parent_id,
        display_order: idx,
      }));
      onReorder(entries);
    },
    [flatRows, categories, onReorder],
  );

  const activeNode = activeId
    ? flatRows.find((r) => r.category.id === activeId)
    : null;

  if (flatRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-12 text-center text-muted">
        No categories match your filters.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={flatRows.map((r) => r.category.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-1 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-2">
          {flatRows.map((node) => (
            <SortableTreeRow
              key={node.category.id}
              node={node}
              hasChildren={node.children.length > 0}
              expanded={expandedSet.has(node.category.id)}
              onToggleExpand={toggleExpanded}
              selected={selectedSet.has(node.category.id)}
              onToggleSelect={toggleSelected}
              productCount={productCountMap[node.category.id] ?? 0}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onDelete={onDelete}
              onToggleVisibility={onToggleVisibility}
              onScopeChange={onScopeChange}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeNode && (
          <div className="rounded-xl border border-[var(--ink)] bg-[var(--card-bg)] shadow-xl">
            <CategoryRow
              category={activeNode.category}
              depth={activeNode.depth}
              productCount={productCountMap[activeNode.category.id] ?? 0}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface SortableRowProps {
  node: TreeNode;
  hasChildren: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  productCount: number;
  onEdit: (c: Category) => void;
  onDuplicate: (c: Category) => void;
  onArchive: (c: Category) => void;
  onDelete: (c: Category) => void;
  onToggleVisibility: (c: Category) => void;
  onScopeChange: (c: Category, scope: CategoryScope) => void;
  onOpenDetail?: (c: Category) => void;
}

function SortableTreeRow({
  node,
  hasChildren,
  expanded,
  onToggleExpand,
  selected,
  onToggleSelect,
  productCount,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleVisibility,
  onScopeChange,
  onOpenDetail,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.category.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <CategoryRow
        category={node.category}
        depth={node.depth}
        hasChildren={hasChildren}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        selected={selected}
        onToggleSelect={onToggleSelect}
        productCount={productCount}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onArchive={onArchive}
        onDelete={onDelete}
        onToggleVisibility={onToggleVisibility}
        onScopeChange={onScopeChange}
        onOpenDetail={onOpenDetail}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}
