/**
 * Two-letter initials for a name. Multi-word names take the first letter of
 * the first two words, so "عطور رجالية" and "عطور نسائية" read "عر" and "عن"
 * instead of both "عط". The Arabic article "ال" is dropped first: as
 * initials it says nothing.
 */
export function initialsOf(name: string): string {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (w.length > 2 ? w.replace(/^ال/, "") : w));
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}
