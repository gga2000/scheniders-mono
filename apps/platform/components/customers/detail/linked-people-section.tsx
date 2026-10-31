"use client";

import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Link2, Plus, UserPlus, Home, Users, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerLinks, useUnlinkCustomers } from "@/hooks/use-customer-links";
import { formatPhoneDisplay } from "@/lib/customer-format";
import { toast } from "@/hooks/use-toast";
import { useCustomerStore } from "@/store/use-customer-store";

interface LinkedPeopleSectionProps {
    phone: string;
}

const RELATIONSHIP_ICONS: Record<string, React.ElementType> = {
    same_address: Home,
    family: Users,
    coworker: Users,
    duplicate: Copy,
};

const RELATIONSHIP_I18N: Record<string, string> = {
    same_address: "customers.link.sameAddress",
    family: "customers.link.family",
    coworker: "customers.link.coworker",
    duplicate: "customers.link.duplicate",
};

export function LinkedPeopleSection({ phone }: LinkedPeopleSectionProps) {
    const { t } = useLanguage();
    const { can } = usePermission();
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const { data: links = [] } = useCustomerLinks(phone);
    const unlink = useUnlinkCustomers();
    const { setLinkCustomersModalOpen, setLinkCustomersPhone } = useCustomerStore();

    const handleLinkCustomer = () => {
        setLinkCustomersPhone(phone);
        setLinkCustomersModalOpen(true);
    };

    return (
        <div className="bento-card bg-(--card-bg) rounded-[24px] border border-(--card-border) p-6 shadow-[0_4px_12px_rgba(30,30,30,0.03)]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                        {t("customers.link.title")}
                    </span>
                    {links.length > 0 && (
                        <span className="ml-1 text-xs tabular-nums text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-full">
                            {links.length}
                        </span>
                    )}
                </div>
                {canEdit && (
                    <button
                        onClick={handleLinkCustomer}
                        aria-label={t("customers.link.title")}
                        className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Links list */}
            <AnimatePresence mode="wait">
                {links.length === 0 ? (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center gap-3 py-8"
                    >
                        <div className="w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center">
                            <Users className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                            {t("customers.link.empty")}
                        </p>
                        <button
                            onClick={handleLinkCustomer}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                            <Plus className="w-3 h-3" />
                            {t("customers.link.title")}
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="list"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-0"
                    >
                        {links.map((link, i) => {
                            const linkedPhone = link.phone_a === phone ? link.phone_b : link.phone_a;
                            const Icon = RELATIONSHIP_ICONS[link.relationship_type] || Users;
                            const isLast = i === links.length - 1;

                            return (
                                <motion.div
                                    key={link.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.06, duration: 0.3, ease: "easeOut" }}
                                    className={cn(
                                        "flex items-center gap-3 py-3",
                                        !isLast && "border-b border-(--card-border)"
                                    )}
                                >
                                    <div className="w-8 h-8 rounded-full bg-muted/20 flex items-center justify-center shrink-0">
                                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                    <Link
                                        href={`/customers/${linkedPhone}`}
                                        aria-label={t("customers.link.open")}
                                        className="flex-1 min-w-0 rounded-lg hover:bg-muted/20 transition-colors"
                                    >
                                        <p className="text-sm font-medium text-foreground font-mono tabular-nums truncate">
                                            {formatPhoneDisplay(linkedPhone)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {t(RELATIONSHIP_I18N[link.relationship_type] || "customers.link.family")}
                                        </p>
                                        {link.similarity_hint && (
                                            <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                                                {link.similarity_hint}
                                            </p>
                                        )}
                                    </Link>
                                    {canEdit && (
                                        <button
                                            onClick={() => unlink.mutate(
                                                { linkId: link.id, phoneA: link.phone_a, phoneB: link.phone_b },
                                                {
                                                    onSuccess: () => toast({ variant: "success", title: t("customers.link.unlinked") }),
                                                    onError: () => toast({ variant: "error", title: t("customers.link.unlinkFailed") }),
                                                },
                                            )}
                                            disabled={unlink.isPending}
                                            aria-label={t("customers.link.unlink")}
                                            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
