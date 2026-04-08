"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface RejectionReason {
    id: string;
    label: string;
    label_ar?: string;
    is_active: boolean;
    sort_order: number;
}

export function RejectionReasonsList() {
    const [reasons, setReasons] = useState<RejectionReason[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newReason, setNewReason] = useState("");

    useEffect(() => {
        fetchReasons();
    }, []);

    async function fetchReasons() {
        try {
            const { data, error } = await supabase
                .from("rejection_reasons")
                .select("*")
                .order("sort_order");

            if (data) setReasons(data);
        } catch (err) {
            console.error("Error fetching reasons:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleAdd() {
        if (!newReason.trim()) return;

        try {
            // Get max sort order
            const maxSort = Math.max(...reasons.map(r => r.sort_order), 0);

            const { data, error } = await supabase
                .from("rejection_reasons")
                .insert([{
                    label: newReason,
                    sort_order: maxSort + 1,
                    is_active: true
                }])
                .select()
                .single();

            if (error) throw error;
            if (data) {
                setReasons([...reasons, data]);
                setNewReason("");
                setIsAdding(false);
            }
        } catch (err) {
            alert("Failed to add reason. It might already exist.");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this reason?")) return;

        setReasons(reasons.filter(r => r.id !== id)); // Optimistic

        const { error } = await supabase
            .from("rejection_reasons")
            .delete()
            .eq("id", id);

        if (error) {
            fetchReasons(); // Revert on error
        }
    }

    async function toggleActive(id: string, currentState: boolean) {
        setReasons(reasons.map(r => r.id === id ? { ...r, is_active: !currentState } : r));

        const { error } = await supabase
            .from("rejection_reasons")
            .update({ is_active: !currentState })
            .eq("id", id);
    }

    if (loading) return <div className="text-sm text-muted-foreground">Loading reasons...</div>;

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                {reasons.map((reason) => (
                    <div
                        key={reason.id}
                        className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                            <div className="flex flex-col">
                                <span className={!reason.is_active ? "text-muted-foreground line-through" : ""}>
                                    {reason.label}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => toggleActive(reason.id, reason.is_active)}
                            >
                                {reason.is_active ? "Active" : "Disabled"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDelete(reason.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {isAdding ? (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                    <Input
                        placeholder="Enter reason (e.g., 'No Answer')"
                        value={newReason}
                        onChange={(e) => setNewReason(e.target.value)}
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    />
                    <Button size="sm" onClick={handleAdd} disabled={!newReason.trim()}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}><X className="h-4 w-4" /></Button>
                </div>
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed"
                    onClick={() => setIsAdding(true)}
                >
                    <Plus className="mr-2 h-3.5 w-3.5" /> Ad Reason
                </Button>
            )}
        </div>
    );
}
