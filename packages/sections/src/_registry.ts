// =====================================================================
// Section registry
// =====================================================================
// In-memory map of `type` → `SectionDefinition`. Sections add themselves
// via `registerSection(def)` as a side effect when their module is first
// imported (see `sections/index.ts` for the barrel that triggers it).
//
// Re-registering the same `type` overwrites — this matters for HMR in
// dev where modules are re-evaluated on edit.
// =====================================================================

import type { PageId } from "@scheniders/shared";
import type { AnySectionDefinition, SectionDefinition } from "./_types";

const REGISTRY = new Map<string, AnySectionDefinition>();

export function registerSection<P>(def: SectionDefinition<P>): void {
  REGISTRY.set(def.type, def as AnySectionDefinition);
}

export function getSection(type: string): AnySectionDefinition | undefined {
  return REGISTRY.get(type);
}

export interface ListSectionsOptions {
  for_page?: PageId;
  category?: AnySectionDefinition["category"];
}

export function listSections(opts?: ListSectionsOptions): AnySectionDefinition[] {
  return [...REGISTRY.values()].filter((s) => {
    if (opts?.for_page && !s.valid_on.includes(opts.for_page)) return false;
    if (opts?.category && s.category !== opts.category) return false;
    return true;
  });
}

/** Test helper — wipes the registry. Not exported via the barrel. */
export function __resetRegistry(): void {
  REGISTRY.clear();
}

/** Test helper — current registered type count. */
export function __registrySize(): number {
  return REGISTRY.size;
}
