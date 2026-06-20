// apps/platform/lib/chat/parse-references.ts
import type { ChatReference } from "@/types/chat";

export function dedupeReferences(refs: ChatReference[]): ChatReference[] {
    const seen = new Set<string>();
    const out: ChatReference[] = [];
    for (const r of refs) {
        const key = `${r.ref_type}:${r.ref_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}

export function dedupeMentions(ids: string[]): string[] {
    return Array.from(new Set(ids));
}
