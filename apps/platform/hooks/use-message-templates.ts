"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export type TemplateType = "confirmation" | "reminder" | "discount";

export interface MessageTemplateRow {
    id: string;
    name: string;
    content: string;
    content_ar?: string | null;
    is_active: boolean;
    template_type?: TemplateType | null;
}

/** A template being written; id "new" until it is saved. */
export type TemplateDraft = MessageTemplateRow;

const NEW_ID = "new";
const TEMPLATE_TYPES: readonly TemplateType[] = ["confirmation", "reminder", "discount"];
const COLUMNS = "id, name, content, content_ar, is_active, template_type";

/** A row as the database returns it (template_type is free text there); unknown types read as general. */
function toRow(row: { id: string; name: string; content: string; content_ar: string | null; is_active: boolean | null; template_type: string | null }): MessageTemplateRow {
    return {
        id: row.id,
        name: row.name,
        content: row.content,
        content_ar: row.content_ar,
        is_active: row.is_active !== false,
        template_type: TEMPLATE_TYPES.find((type) => type === row.template_type) ?? null,
    };
}

/** This shop's WhatsApp message templates, in the order the Orders panel lists them. */
function useMessageTemplateRows() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const key = ["message-templates", tenantId] as const;

    const query = useQuery({
        queryKey: key,
        enabled: !!tenantId,
        queryFn: async (): Promise<MessageTemplateRow[]> => {
            const { data, error } = await supabase
                .from("message_templates")
                .select(COLUMNS)
                .eq("tenant_id", tenantId!)
                .order("sort_order");
            if (error) throw error;
            return (data ?? []).map(toRow);
        },
    });

    const setRows = (update: (rows: MessageTemplateRow[]) => MessageTemplateRow[]) =>
        queryClient.setQueryData<MessageTemplateRow[]>(key, (rows) => update(rows ?? []));

    const save = useMutation({
        mutationFn: async (draft: TemplateDraft): Promise<MessageTemplateRow> => {
            const fields = {
                name: draft.name.trim(),
                content: draft.content,
                content_ar: draft.content_ar ?? "",
                template_type: draft.template_type ?? null,
            };
            if (draft.id === NEW_ID) {
                if (!tenantId) throw new Error("no-tenant");
                const { data, error } = await supabase
                    .from("message_templates")
                    .insert([{ ...fields, tenant_id: tenantId, is_active: true }])
                    .select(COLUMNS)
                    .single();
                if (error || !data) throw new Error(error?.message ?? "insert failed");
                return toRow(data);
            }
            const { error } = await supabase.from("message_templates").update(fields).eq("id", draft.id);
            if (error) throw new Error(error.message);
            return { ...draft, ...fields };
        },
        onSuccess: (row) =>
            setRows((rows) => (rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row])),
    });

    const remove = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("message_templates").delete().eq("id", id);
            if (error) throw new Error(error.message);
            return id;
        },
        onSuccess: (id) => setRows((rows) => rows.filter((r) => r.id !== id)),
    });

    return { rows: query.data ?? [], loading: query.isLoading, save, remove };
}

/**
 * Settings › WhatsApp messages: which template is open, the edits not saved
 * yet, and saving or deleting it. The preview reads `current`.
 */
export function useTemplateEditor() {
    const { t } = useLanguage();
    const { rows, loading, save, remove } = useMessageTemplateRows();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Edits not saved yet; null = the open template shows as saved.
    const [draft, setDraft] = useState<TemplateDraft | null>(null);

    const current: TemplateDraft | null = draft ?? rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
    const dirty = draft !== null;

    const leaveDraft = () => !dirty || window.confirm(t("templates.discardConfirm"));

    const select = (id: string) => {
        if (id === current?.id || !leaveDraft()) return;
        setDraft(null);
        setSelectedId(id);
    };

    const startNew = () => {
        if (!leaveDraft()) return;
        setSelectedId(NEW_ID);
        setDraft({ id: NEW_ID, name: "", content: "", content_ar: "", is_active: true, template_type: null });
    };

    const change = (patch: Partial<Omit<TemplateDraft, "id">>) => {
        if (current) setDraft({ ...current, ...patch });
    };

    const discard = () => {
        setDraft(null);
        if (selectedId === NEW_ID) setSelectedId(null);
    };

    const saveCurrent = async () => {
        if (!draft || !draft.name.trim()) return;
        try {
            const row = await save.mutateAsync(draft);
            setSelectedId(row.id);
            setDraft(null);
            toast.success(t("templates.saved"));
        } catch (error) {
            const message = error instanceof Error ? error.message : undefined;
            toast.error(t("templates.saveFailed"), message === "no-tenant" ? t("templates.noWorkspace") : message);
        }
    };

    const deleteCurrent = async () => {
        if (!current || current.id === NEW_ID || !window.confirm(t("templates.deleteConfirm"))) return;
        try {
            await remove.mutateAsync(current.id);
            setSelectedId(null);
            setDraft(null);
        } catch (error) {
            toast.error(t("templates.deleteFailed"), error instanceof Error ? error.message : undefined);
        }
    };

    return {
        templates: rows,
        loading,
        current,
        isNew: current?.id === NEW_ID,
        dirty,
        saving: save.isPending,
        select,
        startNew,
        change,
        discard,
        save: saveCurrent,
        remove: deleteCurrent,
    };
}

export type TemplateEditor = ReturnType<typeof useTemplateEditor>;
