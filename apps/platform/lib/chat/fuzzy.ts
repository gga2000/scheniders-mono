// apps/platform/lib/chat/fuzzy.ts
/** Rank items by how well `query` matches keyFn(item): exact-substring beats
 *  subsequence; non-matches dropped. Empty query → original order preserved. */
export function fuzzyRank<T>(items: T[], query: string, keyFn: (item: T) => string): T[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const scored: { item: T; score: number }[] = [];
    for (const item of items) {
        const hay = keyFn(item).toLowerCase();
        const idx = hay.indexOf(q);
        if (idx >= 0) { scored.push({ item, score: 1000 - idx }); continue; }
        // subsequence: all chars of q appear in order
        let qi = 0;
        for (let h = 0; h < hay.length && qi < q.length; h++) if (hay[h] === q[qi]) qi++;
        if (qi === q.length) scored.push({ item, score: 100 - (hay.length - q.length) });
    }
    return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
