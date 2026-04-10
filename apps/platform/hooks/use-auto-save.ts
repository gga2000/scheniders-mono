"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseAutoSaveOptions<T> {
    key: string; // localStorage key
    data: T;
    interval?: number; // ms, default 30000 (30s)
    enabled?: boolean;
}

interface UseAutoSaveReturn<T> {
    hasDraft: boolean;
    draftData: T | null;
    restoreDraft: () => T | null;
    clearDraft: () => void;
    saveDraft: () => void;
}

export function useAutoSave<T>({ key, data, interval = 30000, enabled = true }: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
    const [hasDraft, setHasDraft] = useState(false);
    const [draftData, setDraftData] = useState<T | null>(null);
    const dataRef = useRef(data);
    dataRef.current = data;

    // Check for existing draft on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
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

        const timer = setInterval(() => {
            try {
                localStorage.setItem(key, JSON.stringify({
                    data: dataRef.current,
                    savedAt: new Date().toISOString(),
                }));
            } catch {
                // localStorage full or unavailable
            }
        }, interval);

        return () => clearInterval(timer);
    }, [key, interval, enabled]);

    // Save before unload
    useEffect(() => {
        if (!enabled) return;

        const handleBeforeUnload = () => {
            try {
                localStorage.setItem(key, JSON.stringify({
                    data: dataRef.current,
                    savedAt: new Date().toISOString(),
                }));
            } catch {
                // Ignore
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [key, enabled]);

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

    const saveDraft = useCallback(() => {
        try {
            localStorage.setItem(key, JSON.stringify({
                data: dataRef.current,
                savedAt: new Date().toISOString(),
            }));
        } catch {
            // Ignore
        }
    }, [key]);

    return { hasDraft, draftData, restoreDraft, clearDraft, saveDraft };
}
