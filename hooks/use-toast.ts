"use client";

import * as React from "react";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 400; // ms for exit animation

export type ToastVariant = "default" | "success" | "error" | "warning";

export type ToastActionElement = React.ReactElement<{
    altText: string;
    onClick: () => void;
}>;

export interface Toast {
    id: string;
    title: string;
    description?: string;
    variant?: ToastVariant;
    duration?: number;
    action?: {
        label: string;
        onClick: () => void;
    };
    icon?: React.ReactNode;
    open?: boolean;
}

type ToastAction =
    | { type: "ADD_TOAST"; toast: Toast }
    | { type: "UPDATE_TOAST"; toast: Partial<Toast> & { id: string } }
    | { type: "DISMISS_TOAST"; id?: string }
    | { type: "REMOVE_TOAST"; id?: string };

interface ToastState {
    toasts: Toast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(id: string, dispatch: React.Dispatch<ToastAction>) {
    if (toastTimeouts.has(id)) return;

    const timeout = setTimeout(() => {
        toastTimeouts.delete(id);
        dispatch({ type: "REMOVE_TOAST", id });
    }, TOAST_REMOVE_DELAY);

    toastTimeouts.set(id, timeout);
}

function reducer(state: ToastState, action: ToastAction): ToastState {
    switch (action.type) {
        case "ADD_TOAST":
            return {
                ...state,
                toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
            };

        case "UPDATE_TOAST":
            return {
                ...state,
                toasts: state.toasts.map((t) =>
                    t.id === action.toast.id ? { ...t, ...action.toast } : t
                ),
            };

        case "DISMISS_TOAST": {
            const targetId = action.id;
            return {
                ...state,
                toasts: state.toasts.map((t) =>
                    t.id === targetId || !targetId ? { ...t, open: false } : t
                ),
            };
        }

        case "REMOVE_TOAST":
            if (!action.id) return { ...state, toasts: [] };
            return {
                ...state,
                toasts: state.toasts.filter((t) => t.id !== action.id),
            };

        default:
            return state;
    }
}

// Global listeners for cross-component usage
const listeners: Array<(state: ToastState) => void> = [];
let memoryState: ToastState = { toasts: [] };
let globalDispatch: React.Dispatch<ToastAction> | null = null;

function dispatch(action: ToastAction) {
    memoryState = reducer(memoryState, action);
    listeners.forEach((listener) => listener(memoryState));
}

let idCounter = 0;
function genId() {
    idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
    return idCounter.toString();
}

// Default durations per variant
const DURATIONS: Record<ToastVariant, number> = {
    default: 5000,
    success: 5000,
    warning: 6000,
    error: 8000,
};

interface ToastOptions {
    title: string;
    description?: string;
    variant?: ToastVariant;
    duration?: number;
    action?: { label: string; onClick: () => void };
    icon?: React.ReactNode;
}

function createToast(options: ToastOptions) {
    const id = genId();
    const variant = options.variant || "default";
    const duration = options.duration ?? DURATIONS[variant];

    const toast: Toast = {
        ...options,
        id,
        variant,
        duration,
        open: true,
    };

    dispatch({ type: "ADD_TOAST", toast });

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            dispatch({ type: "DISMISS_TOAST", id });
            // Schedule removal after exit animation
            setTimeout(() => {
                dispatch({ type: "REMOVE_TOAST", id });
            }, TOAST_REMOVE_DELAY);
        }, duration);
    }

    return id;
}

// Convenience API
export function toast(options: ToastOptions) {
    return createToast(options);
}

toast.success = (title: string, description?: string) =>
    createToast({ title, description, variant: "success" });

toast.error = (title: string, description?: string) =>
    createToast({ title, description, variant: "error" });

toast.warning = (title: string, description?: string) =>
    createToast({ title, description, variant: "warning" });

export function dismissToast(id?: string) {
    dispatch({ type: "DISMISS_TOAST", id });
}

// Hook for components that need to read toasts (i.e., the Toaster)
export function useToast() {
    const [state, setState] = React.useState<ToastState>(memoryState);

    React.useEffect(() => {
        listeners.push(setState);
        return () => {
            const index = listeners.indexOf(setState);
            if (index > -1) listeners.splice(index, 1);
        };
    }, []);

    return {
        ...state,
        toast,
        dismiss: dismissToast,
    };
}
