"use client";

import { Bot, Sparkles, Truck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { ActorKind } from "@/lib/orders/order-activity";

const MACHINE_NAMES: Record<string, string> = {
    automation: "orders.history.actor.automation",
    system: "orders.history.actor.system",
    whatsapp_bot: "orders.history.actor.whatsapp_bot",
    customer: "orders.history.actor.customer",
    waseet: "orders.history.actor.waseet",
};

/** The name a person reads for an actor: staff names as written, machines in the reader's language. */
export function useActorName(): (actor: string | null, kind: ActorKind) => string {
    const { t } = useLanguage();
    return (actor, kind) => {
        if (kind === "claude") return t("orders.history.actor.claude");
        const key = MACHINE_NAMES[actor?.trim().toLowerCase() ?? ""];
        if (key) return t(key);
        return actor?.trim() || t("orders.history.actor.system");
    };
}

const TONE: Record<ActorKind, string> = {
    staff: "bg-[var(--ink)] text-[var(--ink-contrast)]",
    claude: "bg-[var(--pastel-purple)] text-violet-900",
    automation: "bg-[var(--card-border)] text-[var(--foreground-muted)]",
    customer: "bg-[var(--pastel-green)] text-emerald-900",
    courier: "bg-[var(--pastel-blue)] text-blue-900",
};

/** Who did it: an initial for a person, an icon for a machine, then the name. */
export function HistoryActor({ actor, kind }: { actor: string | null; kind: ActorKind }) {
    const name = useActorName()(actor, kind);
    const Icon = kind === "automation" ? Bot : kind === "claude" ? Sparkles : kind === "courier" ? Truck : kind === "customer" ? User : null;
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
                aria-hidden="true"
                className={cn("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold uppercase leading-none", TONE[kind])}
            >
                {Icon ? <Icon className="h-2.5 w-2.5" /> : name.charAt(0)}
            </span>
            <span className="truncate font-medium text-[var(--foreground)]">{name}</span>
        </span>
    );
}
