"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Link2, Users } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { useLinkCustomers } from "@/hooks/use-customer-links";
import { mapCustomerRow, toCustomerRpcArgs, type CustomerRpcRow, type PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { formatPhoneDisplay } from "@/lib/customer-format";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { ModalShell } from "./modal-shell";
import { cn } from "@/lib/utils";

const RELATIONSHIP_TYPES = ["same_address", "family", "coworker", "duplicate"] as const;

export function LinkCustomersModal() {
    const { t } = useLanguage();
    const { isLinkCustomersModalOpen, setLinkCustomersModalOpen, linkCustomersPhone } = useCustomerStore();
    const linkMutation = useLinkCustomers();

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<PaginatedCustomer[] | null>(null);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [relationshipType, setRelationshipType] = useState<typeof RELATIONSHIP_TYPES[number]>("family");
    const [isSearching, setIsSearching] = useState(false);

    const handleClose = () => {
        setLinkCustomersModalOpen(false);
        setSearchQuery("");
        setSearchResults(null);
        setSelectedPhone(null);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        // Same search as the customers list: this store only, any phone shape.
        const { data, error } = await supabase.rpc(
            "get_paginated_customers",
            toCustomerRpcArgs({ search: searchQuery.trim() }, 11, 0),
        );
        setIsSearching(false);
        if (error) {
            toast({ variant: "error", title: t("customers.link.searchFailed") });
            return;
        }
        setSearchResults(((data ?? []) as CustomerRpcRow[]).map(mapCustomerRow).filter((c) => c.phone !== linkCustomersPhone).slice(0, 10));
    };

    const handleLink = () => {
        if (!linkCustomersPhone || !selectedPhone) return;
        linkMutation.mutate({
            phoneA: linkCustomersPhone,
            phoneB: selectedPhone,
            relationshipType,
        }, {
            onSuccess: () => {
                toast({ variant: "success", title: t("customers.link.done") });
                handleClose();
            },
            onError: (error) => toast({
                variant: "error",
                title: t((error as { code?: string }).code === "23505" ? "customers.link.alreadyLinked" : "customers.link.failed"),
            }),
        });
    };

    return (
        <ModalShell isOpen={isLinkCustomersModalOpen} onClose={handleClose} title={t("customers.link.title")} maxWidth="max-w-xl">
            <div className="space-y-6">
                {/* Anchor customer */}
                <div className="p-4 rounded-xl bg-muted/20 border border-(--card-border)">
                    <p className="text-xs text-muted-foreground">{t("customers.link.primary")}</p>
                    <p className="font-mono text-sm font-medium text-foreground tabular-nums mt-1">{linkCustomersPhone && formatPhoneDisplay(linkCustomersPhone)}</p>
                </div>

                {/* Search */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            placeholder={t("customers.link.search")}
                            className="w-full h-11 pl-10 pr-4 bg-muted/20 border border-(--card-border) rounded-xl text-sm focus:ring-2 focus:ring-foreground/10"
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="h-11 px-4 bg-foreground text-background rounded-xl text-sm font-medium disabled:opacity-50"
                    >
                        {t("customers.link.find")}
                    </button>
                </div>

                {/* Results */}
                {searchResults?.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-3">{t("customers.link.noResults")}</p>
                )}
                {searchResults && searchResults.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {searchResults.map((result) => (
                            <button
                                key={result.phone}
                                onClick={() => setSelectedPhone(result.phone)}
                                className={cn(
                                    "w-full p-3 rounded-xl border text-left transition-all flex items-center gap-3",
                                    selectedPhone === result.phone
                                        ? "border-foreground bg-foreground/5"
                                        : "border-(--card-border) hover:border-foreground/30"
                                )}
                            >
                                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                                    <p className="text-xs text-muted-foreground font-mono tabular-nums">{formatPhoneDisplay(result.phone)}</p>
                                </div>
                                <span className="text-xs text-muted-foreground">{result.city}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Relationship type */}
                {selectedPhone && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                        <p className="text-sm font-medium text-foreground">{t("customers.link.relationship")}</p>
                        <div className="flex flex-wrap gap-2">
                            {RELATIONSHIP_TYPES.map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setRelationshipType(type)}
                                    className={cn(
                                        "px-4 py-2 rounded-full text-sm font-medium border transition-all",
                                        relationshipType === type
                                            ? "bg-foreground text-background border-foreground"
                                            : "border-(--card-border) text-muted-foreground hover:bg-muted/30"
                                    )}
                                >
                                    {t(`customers.link.${type === "same_address" ? "sameAddress" : type}`)}
                                </button>
                            ))}
                        </div>

                        {/* Preview cluster */}
                        <div className="flex items-center justify-center gap-4 py-6">
                            <div className="w-12 h-12 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold text-foreground">A</div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-16 border-t-2 border-dashed border-muted-foreground/40" />
                                <Link2 className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="w-12 h-12 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold text-foreground">B</div>
                        </div>

                        <button
                            onClick={handleLink}
                            disabled={linkMutation.isPending}
                            className="w-full bg-foreground text-background py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                            {t("customers.link.title")}
                        </button>
                    </motion.div>
                )}
            </div>
        </ModalShell>
    );
}
