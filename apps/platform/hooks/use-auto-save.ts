"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseAutoSaveOptions<T> {
    key: string; // localStorage key
    data: T;
    interval?: number; // ms, default 30000 (30s)
    enabled?: boolean;
    /**
     * What the draft was based on (the record's updated_at). A stored draft
     * from a different version is discarded instead of offered: restoring it
     * would write back values someone has since changed.
     */
    version?: string | null;
}

interface UseAutoSaveReturn<T> {
    hasDraft: boolean;
    draftData: T | null;
    restoreDraft: () => T | null;
    clearDraft: () => void;
    saveDraft: () => void;
}

export function useAutoSave<T>({ key, data, interval = 30000, enabled = true, version = null }: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
    const [hasDraft, setHasDraft] = useState(false);
    const [draftData, setDraftData] = useState<T | null>(null);
    const dataRef = useRef(data);
    dataRef.current = data;
    const versionRef = useRef(version);
    versionRef.current = version;

    const write = useCallback(() => {
        try {
            localStorage.setItem(key, JSON.stringify({
                data: dataRef.current,
                version: versionRef.current,
                savedAt: new Date().toISOString(),
            }));
        } catch {
            // localStorage full or unavailable: the draft is a convenience only.
        }
    }, [key]);

    // Check for existing draft on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
                if ((parsed.version ?? null) !== versionRef.current) {
                    localStorage.removeItem(key);
                    return;
                }
                setDraftData(parsed.data);
                setHasDraft(true);
            }
        } catch {
            // Invalid data, clear it
            localStorage.removeItem(key);
        }
    }, [key]);

    // Auto-save on interval
    useEffect(() => {
        if (!enabled) return;

        const timer = setInterval(write, interval);
        return () => clearInterval(timer);
    }, [write, interval, enabled]);

    // Save before unload
    useEffect(() => {
        if (!enabled) return;

        window.addEventListener("beforeunload", write);
        return () => window.removeEventListener("beforeunload", write);
    }, [write, enabled]);

    const restoreDraft = useCallback(() => {
        if (draftData) {
            setHasDraft(false);
            return draftData;
        }
        return null;
    }, [draftData]);

    const clearDraft = useCallback(() => {
        localStorage.removeItem(key);
        setHasDraft(false);
        setDraftData(null);
    }, [key]);

    return { hasDraft, draftData, restoreDraft, clearDraft, saveDraft: write };
}
