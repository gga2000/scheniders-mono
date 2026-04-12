"use client";

import { useCallback, useRef } from "react";

interface Options {
    threshold?: number;
    onCancel?: () => void;
}

export function useLongPress(onLongPress: () => void, { threshold = 500, onCancel }: Options = {}) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const triggeredRef = useRef(false);

    const clear = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback(() => {
        triggeredRef.current = false;
        clear();
        timerRef.current = setTimeout(() => {
            triggeredRef.current = true;
            onLongPress();
        }, threshold);
    }, [clear, onLongPress, threshold]);

    const cancel = useCallback(() => {
        clear();
        if (!triggeredRef.current) onCancel?.();
    }, [clear, onCancel]);

    return {
        onPointerDown: start,
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        isLongPressing: () => triggeredRef.current,
    };
}
