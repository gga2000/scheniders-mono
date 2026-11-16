import { BarChart3, Building2, Headset, Inbox, Landmark, Settings, UserPlus, type LucideIcon } from "lucide-react";
import type { MenuIcon } from "@/lib/admin-menu";

/** The icon beside each place on the menu, and beside its pages in the command palette. */
export const MENU_ICONS: Record<MenuIcon, LucideIcon> = {
  today: Inbox,
  merchants: Building2,
  leads: UserPlus,
  support: Headset,
  money: Landmark,
  numbers: BarChart3,
  settings: Settings,
};
