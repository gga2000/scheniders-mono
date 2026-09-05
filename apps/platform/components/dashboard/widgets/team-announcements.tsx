"use client";

import { useState, useRef } from "react";
import { Announcement } from "@/hooks/use-announcements";
import { Pin, PinOff, Trash2, Plus, Megaphone, X, Send, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

function useTimeAgoAnnouncements() {
    const { t } = useLanguage();
    return (dateStr: string): string => {
        const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
        if (diff < 60) return t("dashboard.announcements.justNow");
        if (diff < 3600) return `${Math.floor(diff / 60)}${t("dashboard.timeAgo.minutes")}`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}${t("dashboard.timeAgo.hours")}`;
        return `${Math.floor(diff / 86400)}${t("dashboard.timeAgo.days")}`;
    };
}

interface TeamAnnouncementsProps {
    announcements: Announcement[];
    isAdmin: boolean;
    loading: boolean;
    /** Read failed. Rendered instead of the empty state — a failure is not "no announcements". */
    error?: string | null;
    onCreate: (content: string) => Promise<void>;
    onTogglePin: (id: string, currentlyPinned: boolean) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

export function TeamAnnouncements({
    announcements,
    isAdmin,
    loading,
    error,
    onCreate,
    onTogglePin,
    onDelete,
}: TeamAnnouncementsProps) {
    const [isComposing, setIsComposing] = useState(false);
    const [draft, setDraft] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { t } = useLanguage();
    const timeAgo = useTimeAgoAnnouncements();

    const handleSubmit = async () => {
        if (!draft.trim() || submitting) return;
        setSubmitting(true);
        await onCreate(draft);
        setDraft('');
        setIsComposing(false);
        setSubmitting(false);
    };

    const handleDelete = async (id: string) => {
        if (confirmDelete === id) {
            await onDelete(id);
            setConfirmDelete(null);
        } else {
            setConfirmDelete(id);
            // Auto-reset after 3 seconds
            setTimeout(() => setConfirmDelete(prev => prev === id ? null : prev), 3000);
        }
    };

    return (
        <div className="pastel-card pastel-card-green p-5 md:p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-white/40 flex items-center justify-center">
                        <Megaphone className="w-4 h-4 text-green-700" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-green-950">{t("dashboard.announcements.title")}</h3>
                        <p className="text-xs text-green-900/50">{t("dashboard.announcements.subtitle")}</p>
                    </div>
                </div>

                {isAdmin && !isComposing && (
                    <button
                        onClick={() => { setIsComposing(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/50 hover:bg-white/70 text-green-800 text-xs font-semibold transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {t("dashboard.announcements.add")}
                    </button>
                )}
            </div>

            {/* Compose box */}
            {isAdmin && isComposing && (
                <div className="mb-3 rounded-2xl bg-white/50 p-3 space-y-2">
                    <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
                        placeholder={t("dashboard.announcements.placeholder")}
                        rows={3}
                        className="w-full text-sm text-green-950 placeholder:text-green-900/30 bg-transparent resize-none focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => { setIsComposing(false); setDraft(''); }}
                            className="p-1.5 rounded-lg hover:bg-white/60 text-green-700 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!draft.trim() || submitting}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Send className="w-3 h-3" />
                            {submitting ? t("dashboard.announcements.sending") : t("dashboard.announcements.send")}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
                {loading && (
                    <div className="flex items-center justify-center h-16 text-green-900/40 text-sm">
                        {t("dashboard.announcements.loading")}
                    </div>
                )}

                {!loading && error && (
                    <div className="flex flex-col items-center justify-center h-24 gap-2 text-rose-700/70">
                        <AlertTriangle className="w-6 h-6" />
                        <p className="text-xs font-semibold">{t("dashboard.announcements.loadFailed")}</p>
                    </div>
                )}

                {!loading && !error && announcements.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-24 gap-2 text-green-900/30">
                        <Megaphone className="w-6 h-6" />
                        <p className="text-xs">{t("dashboard.announcements.noAnnouncements")}</p>
                    </div>
                )}

                {announcements.map(a => (
                    <div
                        key={a.id}
                        className={`rounded-xl p-3 space-y-1.5 transition-all ${a.is_pinned ? 'bg-white/60 border border-green-300/60' : 'bg-white/30 hover:bg-white/50'}`}
                    >
                        {/* Pin indicator */}
                        {a.is_pinned && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 uppercase tracking-wider">
                                <Pin className="w-2.5 h-2.5" />
                                {t("dashboard.announcements.pinned")}
                            </div>
                        )}

                        {/* Content */}
                        <p className="text-xs text-green-950 leading-relaxed whitespace-pre-wrap">{a.content}</p>

                        {/* Meta + actions */}
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] text-green-900/40">
                                <span className="font-semibold">{a.created_by_name}</span>
                                {' · '}
                                {timeAgo(a.created_at)}
                            </div>

                            {isAdmin && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => onTogglePin(a.id, a.is_pinned)}
                                        className="p-1 rounded-lg hover:bg-white/60 text-green-700 transition-colors"
                                        title={a.is_pinned ? t("dashboard.announcements.unpin") : t("dashboard.announcements.pin")}
                                    >
                                        {a.is_pinned
                                            ? <PinOff className="w-3 h-3" />
                                            : <Pin className="w-3 h-3" />
                                        }
                                    </button>
                                    <button
                                        onClick={() => handleDelete(a.id)}
                                        className={`p-1 rounded-lg transition-colors ${confirmDelete === a.id ? 'bg-rose-100 text-rose-600' : 'hover:bg-white/60 text-green-700'}`}
                                        title={confirmDelete === a.id ? t("dashboard.announcements.confirmDelete") : t("dashboard.announcements.delete")}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
