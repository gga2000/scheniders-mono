"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { useAddCustomerNote } from "@/hooks/use-customer-notes";
import { ModalShell } from "./modal-shell";

interface AddNoteModalProps {
    phone: string;
}

export function AddNoteModal({ phone }: AddNoteModalProps) {
    const { t } = useLanguage();
    const { isAddNoteModalOpen, setAddNoteModalOpen } = useCustomerStore();
    const addNote = useAddCustomerNote(phone);
    const [text, setText] = useState("");

    useEffect(() => {
        if (!isAddNoteModalOpen) setText("");
    }, [isAddNoteModalOpen]);

    const handleClose = () => setAddNoteModalOpen(false);

    const handleSave = () => {
        if (!text.trim() || addNote.isPending) return;
        addNote.mutate(text, { onSuccess: handleClose });
    };

    return (
        <ModalShell
            isOpen={isAddNoteModalOpen}
            onClose={handleClose}
            title={t("customers.notes.add")}
        >
            <div className="space-y-5">
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 1000))}
                    placeholder={t("customers.notes.placeholder")}
                    autoFocus
                    rows={6}
                    className="w-full bg-muted/20 border border-(--card-border) rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-foreground/10 focus:outline-none"
                />
                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground tabular-nums">
                        {text.length}/1000
                    </p>
                    <button
                        onClick={handleSave}
                        disabled={!text.trim() || addNote.isPending}
                        className="bg-foreground text-background px-6 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
                    >
                        {addNote.isPending
                            ? t("customers.notes.saving")
                            : t("customers.notes.save")}
                    </button>
                </div>
            </div>
        </ModalShell>
    );
}
