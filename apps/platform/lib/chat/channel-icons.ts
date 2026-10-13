import {
    Hash,
    Megaphone,
    Package,
    Truck,
    Wallet,
    LifeBuoy,
    Sparkles,
    AlertTriangle,
    ClipboardList,
    Users,
    type LucideIcon,
} from "lucide-react";

/**
 * A deliberately small, fixed set of channel glyphs.
 *
 * Fixed rather than free-form for three reasons: the DB stores a short key
 * (`chat_conversations.icon`, constrained to `^[a-z][a-z0-9-]{0,31}$`) instead of
 * markup or a URL; the icons are tree-shaken Lucide components rather than
 * arbitrary remote images; and a curated set keeps the sidebar visually coherent
 * instead of turning into a sticker book.
 *
 * Keys are permanent — renaming one orphans every channel already using it.
 */
export const CHANNEL_ICONS = {
    hash: { icon: Hash, labelKey: "chat.icon.general", fallback: "General" },
    megaphone: { icon: Megaphone, labelKey: "chat.icon.announcements", fallback: "Announcements" },
    package: { icon: Package, labelKey: "chat.icon.orders", fallback: "Orders" },
    truck: { icon: Truck, labelKey: "chat.icon.delivery", fallback: "Delivery" },
    wallet: { icon: Wallet, labelKey: "chat.icon.finance", fallback: "Finance" },
    support: { icon: LifeBuoy, labelKey: "chat.icon.support", fallback: "Support" },
    sparkles: { icon: Sparkles, labelKey: "chat.icon.ideas", fallback: "Ideas" },
    alert: { icon: AlertTriangle, labelKey: "chat.icon.issues", fallback: "Issues" },
    tasks: { icon: ClipboardList, labelKey: "chat.icon.tasks", fallback: "Tasks" },
    team: { icon: Users, labelKey: "chat.icon.team", fallback: "Team" },
} as const satisfies Record<string, { icon: LucideIcon; labelKey: string; fallback: string }>;

export type ChannelIconKey = keyof typeof CHANNEL_ICONS;

export const CHANNEL_ICON_KEYS = Object.keys(CHANNEL_ICONS) as ChannelIconKey[];

/** Resolve a stored key to its component, falling back to the hash for unknown keys. */
export function channelIcon(key: string | null | undefined): LucideIcon {
    if (key && key in CHANNEL_ICONS) return CHANNEL_ICONS[key as ChannelIconKey].icon;
    return Hash;
}

export function isChannelIconKey(key: string | null | undefined): key is ChannelIconKey {
    return !!key && key in CHANNEL_ICONS;
}
