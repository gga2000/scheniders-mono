// Column definitions for resizable columns
export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    rowNum: 48, checkbox: 40, orderId: 100, customer: 180, phone: 120, phone2: 120,
    city: 100, address: 200, products: 220, amount: 100, status: 120, source: 72, date: 100, tags: 150,
};

export const COLUMN_KEYS = ['rowNum', 'checkbox', 'orderId', 'customer', 'phone', 'phone2', 'city', 'address', 'products', 'amount', 'status', 'source', 'date', 'tags'] as const;
export const RESIZABLE_COLUMNS = new Set(['customer', 'phone', 'phone2', 'city', 'address', 'products', 'amount', 'status', 'date', 'tags']);

export const loadColumnWidths = (): Record<string, number> => {
    if (typeof window === 'undefined') return { ...DEFAULT_COLUMN_WIDTHS };
    try {
        const stored = localStorage.getItem('table-column-widths');
        if (stored) return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(stored) };
    } catch {}
    return { ...DEFAULT_COLUMN_WIDTHS };
};

// Avatar color palette for customer initials
export const AVATAR_COLORS = [
    { bg: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-emerald-100", text: "text-emerald-700" },
    { bg: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-rose-100", text: "text-rose-700" },
    { bg: "bg-cyan-100", text: "text-cyan-700" },
];

export const getAvatarColor = (name: string) => {
    const code = name ? name.charCodeAt(0) + (name.charCodeAt(name.length - 1) || 0) : 0;
    return AVATAR_COLORS[code % AVATAR_COLORS.length];
};

export const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0);
    return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
};

// Format date without year: M-DD
export const formatDateShort = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}-${d.getDate().toString().padStart(2, '0')}`;
};


// Density config
export const DENSITY_CONFIG = {
    compact: { rowHeight: 52, cellPy: "py-1.5", fontSize: "text-[10px]", avatarSize: "w-6 h-6 text-[9px]" },
    comfortable: { rowHeight: 72, cellPy: "py-2.5", fontSize: "text-xs", avatarSize: "w-7 h-7 text-[10px]" },
    spacious: { rowHeight: 88, cellPy: "py-3.5", fontSize: "text-xs", avatarSize: "w-8 h-8 text-[11px]" },
} as const;
