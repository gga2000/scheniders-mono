"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Tag, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// =============================================
// TYPES
// =============================================

interface TagInputProps {
    productId: string;
    disabled?: boolean;
}

interface ProductTag {
    id: string;
    tenant_id: string;
    name: string;
    color: string;
    created_at: string;
}

interface TagAssignment {
    tag_id: string;
    product_tags: ProductTag;
}

// =============================================
// CONSTANTS
// =============================================

const PRESET_COLORS = [
    "#EF4444",
    "#F97316",
    "#EAB308",
    "#22C55E",
    "#06B6D4",
    "#3B82F6",
    "#8B5CF6",
    "#EC4899",
];

// =============================================
// COMPONENT
// =============================================

export function TagInput({ productId, disabled = false }: TagInputProps) {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [inputValue, setInputValue] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[5]);

    // Fetch all tags for this tenant
    const { data: allTags = [] } = useQuery<ProductTag[]>({
        queryKey: ["product-tags", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("product_tags")
                .select("*")
                .eq("tenant_id", tenantId)
                .order("name");
            if (error) throw error;
            return data ?? [];
        },
        enabled: !!tenantId,
    });

    // Fetch assigned tags for this product
    const { data: assignments = [] } = useQuery<TagAssignment[]>({
        queryKey: ["product-tag-assignments", productId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("product_tag_assignments")
                .select("tag_id, product_tags(*)")
                .eq("product_id", productId);
            if (error) throw error;
            return (data ?? []) as unknown as TagAssignment[];
        },
        enabled: !!productId,
    });

    const assignedTagIds = useMemo(
        () => new Set(assignments.map((a) => a.tag_id)),
        [assignments]
    );

    const assignedTags = useMemo(
        () => assignments.map((a) => a.product_tags).filter(Boolean),
        [assignments]
    );

    const filteredTags = useMemo(() => {
        const q = inputValue.toLowerCase().trim();
        return allTags.filter(
            (tag) =>
                !assignedTagIds.has(tag.id) &&
                (q === "" || tag.name.toLowerCase().includes(q))
        );
    }, [allTags, assignedTagIds, inputValue]);

    const exactMatch = useMemo(
        () =>
            allTags.some(
                (tag) => tag.name.toLowerCase() === inputValue.toLowerCase().trim()
            ),
        [allTags, inputValue]
    );

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
                setIsCreating(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Assign tag mutation
    const assignMutation = useMutation({
        mutationFn: async (tagId: string) => {
            const { error } = await supabase
                .from("product_tag_assignments")
                .insert({ product_id: productId, tag_id: tagId });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-tag-assignments", productId] });
            setInputValue("");
            setIsOpen(false);
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    // Remove tag mutation
    const removeMutation = useMutation({
        mutationFn: async (tagId: string) => {
            const { error } = await supabase
                .from("product_tag_assignments")
                .delete()
                .eq("product_id", productId)
                .eq("tag_id", tagId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-tag-assignments", productId] });
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    // Create tag mutation
    const createMutation = useMutation({
        mutationFn: async ({ name, color }: { name: string; color: string }) => {
            const { data, error } = await supabase
                .from("product_tags")
                .insert({ tenant_id: tenantId, name, color })
                .select()
                .single();
            if (error) throw error;
            return data as ProductTag;
        },
        onSuccess: (newTag) => {
            queryClient.invalidateQueries({ queryKey: ["product-tags", tenantId] });
            assignMutation.mutate(newTag.id);
            setIsCreating(false);
            setNewTagColor(PRESET_COLORS[5]);
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && inputValue.trim()) {
            e.preventDefault();
            // If there's an exact match in the filtered list, assign it
            const match = filteredTags.find(
                (tag) => tag.name.toLowerCase() === inputValue.toLowerCase().trim()
            );
            if (match) {
                assignMutation.mutate(match.id);
            } else if (!exactMatch) {
                // Start creating new tag
                setIsCreating(true);
            }
        }
        if (e.key === "Escape") {
            setIsOpen(false);
            setIsCreating(false);
        }
    };

    const handleCreateConfirm = () => {
        if (inputValue.trim()) {
            createMutation.mutate({ name: inputValue.trim(), color: newTagColor });
        }
    };

    return (
        <div className="relative w-full">
            {/* Assigned tags */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <AnimatePresence mode="popLayout">
                    {assignedTags.map((tag) => (
                        <motion.span
                            key={tag.id}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.15 }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                                backgroundColor: `${tag.color}26`,
                                color: tag.color,
                            }}
                        >
                            <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => removeMutation.mutate(tag.id)}
                                    className="ml-0.5 hover:opacity-70 transition-opacity"
                                    disabled={removeMutation.isPending}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </motion.span>
                    ))}
                </AnimatePresence>
            </div>

            {/* Input */}
            {!disabled && (
                <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setIsOpen(true);
                            setIsCreating(false);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder={t?.("Add tags...") ?? "Add tags..."}
                        className={cn(
                            "w-full pl-9 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)]",
                            "rounded-xl text-foreground placeholder:text-muted",
                            "focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]",
                            "text-sm"
                        )}
                    />
                </div>
            )}

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && !disabled && (inputValue.trim() || filteredTags.length > 0) && (
                    <motion.div
                        ref={dropdownRef}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                            "absolute z-50 mt-1 w-full max-h-56 overflow-y-auto",
                            "bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl",
                            "shadow-lg"
                        )}
                    >
                        {/* Existing tags */}
                        {filteredTags.map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                onClick={() => assignMutation.mutate(tag.id)}
                                disabled={assignMutation.isPending}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground",
                                    "hover:bg-[var(--background)] transition-colors text-left"
                                )}
                            >
                                <span
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                            </button>
                        ))}

                        {/* Create new option */}
                        {inputValue.trim() && !exactMatch && !isCreating && (
                            <button
                                type="button"
                                onClick={() => setIsCreating(true)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-sm",
                                    "text-[var(--pastel-mint)] hover:bg-[var(--background)]",
                                    "transition-colors text-left border-t border-[var(--card-border)]"
                                )}
                            >
                                <Plus className="w-4 h-4" />
                                {t?.("Create") ?? "Create"} &quot;{inputValue.trim()}&quot;
                            </button>
                        )}

                        {/* Inline color picker for new tag */}
                        <AnimatePresence>
                            {isCreating && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="border-t border-[var(--card-border)] overflow-hidden"
                                >
                                    <div className="p-3 space-y-2">
                                        <p className="text-xs text-muted">
                                            {t?.("Pick a color for") ?? "Pick a color for"} &quot;{inputValue.trim()}&quot;
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            {PRESET_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    onClick={() => setNewTagColor(color)}
                                                    className={cn(
                                                        "w-6 h-6 rounded-full transition-all flex items-center justify-center",
                                                        newTagColor === color
                                                            ? "ring-2 ring-offset-2 ring-offset-[var(--card-bg)]"
                                                            : "hover:scale-110"
                                                    )}
                                                    style={{
                                                        backgroundColor: color,
                                                    }}
                                                >
                                                    {newTagColor === color && (
                                                        <Check className="w-3 h-3 text-white" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleCreateConfirm}
                                            disabled={createMutation.isPending}
                                            className={cn(
                                                "w-full py-2 rounded-lg text-sm font-medium transition-colors",
                                                "bg-[var(--pastel-mint)] text-teal-700",
                                                "disabled:opacity-50"
                                            )}
                                        >
                                            {createMutation.isPending
                                                ? (t?.("Creating...") ?? "Creating...")
                                                : (t?.("Create Tag") ?? "Create Tag")}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
