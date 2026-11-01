"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { useAddCustomerNote } from "@/hooks/use-customer-notes";
import { ModalShell } from "./modal-shell";
import { toast } from "@/hooks/use-toast";

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
        addNote.mutate(text, {
            onSuccess: handleClose,
            onError: () => toast({ variant: "error", title: t("customers.quick.noteFailed", "Couldn't save the note. Try again.") }),
        });
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
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleClose}
                            className="px-5 py-2.5 rounded-xl border border-(--card-border) font-semibold text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                            {t("common.cancel")}
                        </button>
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
            </div>
        </ModalShell>
    );
}
