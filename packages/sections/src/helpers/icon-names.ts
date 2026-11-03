// =====================================================================
// Icon font subset — the Material Symbols names the storefront ships
// =====================================================================
// The full icon font is ~388 KB. The storefront asks Google Fonts for just
// these names (`icon_names`), which Google requires sorted A-Z.
//
// The list only decides what ships first, never what can render: a name not
// on it (a merchant can type any name into an icon field) makes
// `MaterialIcon` load the full font once, so the icon still draws. Add a name
// here when it becomes a code literal; the test in icon-names.test.ts fails
// if the list is unsorted or holds a duplicate.
// =====================================================================

export const ICON_NAMES = [
  "ac_unit",
  "add",
  "add_a_photo",
  "add_call",
  "add_circle",
  "add_shopping_cart",
  "anchor",
  "apartment",
  "arrow_back",
  "arrow_downward",
  "arrow_forward",
  "arrow_upward",
  "auto_awesome",
  "bento",
  "block",
  "bolt",
  "cached",
  "calendar_month",
  "call",
  "cards",
  "category",
  "chat",
  "check",
  "check_circle",
  "checkroom",
  "chevron_left",
  "chevron_right",
  "circle",
  "close",
  "content_copy",
  "delete",
  "edit",
  "edit_note",
  "error",
  "expand_less",
  "expand_more",
  "favorite",
  "filter",
  "forum",
  "function",
  "grid_view",
  "group",
  "home",
  "home_pin",
  "http",
  "image",
  "info",
  "keyboard_double_arrow_down",
  "label",
  "landscape",
  "license",
  "link",
  "list",
  "local_fire_department",
  "local_offer",
  "local_shipping",
  "location_on",
  "loyalty",
  "mail",
  "man",
  "map",
  "mark_chat_unread",
  "menu",
  "more",
  "music_note",
  "notes",
  "open_in_new",
  "package_2",
  "payments",
  "percent",
  "person",
  "person_add",
  "photo_camera",
  "photo_library",
  "pill",
  "pin",
  "progress_activity",
  "radio_button_checked",
  "receipt_long",
  "redeem",
  "remove",
  "reorder",
  "reviews",
  "save",
  "schedule",
  "search",
  "sentiment_satisfied",
  "shop",
  "shopping_bag",
  "shopping_basket",
  "shopping_cart",
  "sort",
  "spa",
  "square",
  "stack",
  "star",
  "start",
  "step",
  "store",
  "storefront",
  "sunny",
  "support_agent",
  "task_alt",
  "title",
  "today",
  "tune",
  "undo",
  "verified",
  "verified_user",
  "visibility",
  "waving_hand",
  "wc",
  "woman",
  "workspace_premium",
  "zoom_in",
] as const;

const LISTED = new Set<string>(ICON_NAMES);

export function isListedIcon(name: string): boolean {
  return LISTED.has(name);
}

const FONT_BASE = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,1";

/** Stylesheet URL for the subset the storefront loads up front. */
export const ICON_FONT_SUBSET_HREF = `${FONT_BASE}&icon_names=${ICON_NAMES.join(",")}&display=block`;

/** Stylesheet URL for the whole font, loaded only when an unlisted icon renders. */
export const ICON_FONT_FULL_HREF = `${FONT_BASE}&display=block`;
