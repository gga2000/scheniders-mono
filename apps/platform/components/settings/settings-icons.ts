import {
    BellRing,
    Building2,
    Gauge,
    Link2,
    MessageCircle,
    PackageX,
    Printer,
    ShieldBan,
    Truck,
    UserRound,
    UsersRound,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import type { SettingsSectionId } from "@/lib/settings-sections";

/** One icon per Settings section, shared by the list, the search results and the overview rows. */
export const SETTINGS_SECTION_ICONS: Record<SettingsSectionId, LucideIcon> = {
    overview: Gauge,
    business: Building2,
    billing: Wallet,
    "order-reasons": PackageX,
    messages: MessageCircle,
    "delivery-fees": Truck,
    blacklist: ShieldBan,
    waseet: Link2,
    label: Printer,
    team: UsersRound,
    "staff-alerts": BellRing,
    account: UserRound,
};
