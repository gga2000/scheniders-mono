"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { toast } from "@/hooks/use-toast";
import { reportOrderError } from "@/lib/order-telemetry";

interface Props {
    children: ReactNode;
    /** Identifies which modal failed, in telemetry and in the toast. */
    name: string;
    /** Dismisses the modal so the orders page underneath stays usable. */
    onClose?: () => void;
}

interface State {
    hasError: boolean;
}

/**
 * Error boundary scoped to a single orders modal.
 *
 * Without this, a throw inside any dynamically-imported modal propagates to the
 * route segment boundary (`app/orders/error.tsx`) and replaces the whole orders
 * page with an error screen — losing the user's filters, selection and scroll
 * position because one dialog failed.
 *
 * Mount this *inside* the conditional that renders the modal. That way closing
 * the modal unmounts the boundary, and reopening it gets a fresh one, so a
 * single failure does not permanently disable the dialog.
 */
export class OrderModalBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        reportOrderError(error, {
            operation: `orders-modal:${this.props.name}`,
            extra: { componentStack: errorInfo.componentStack },
        });

        toast.error(
            "This dialog could not be opened",
            "The error has been reported. Your orders are unaffected.",
        );

        // Drop the modal rather than leaving an empty shell over the page.
        this.props.onClose?.();
    }

    render(): ReactNode {
        return this.state.hasError ? null : this.props.children;
    }
}

export default OrderModalBoundary;

/** Props every orders modal exposes for open state and dismissal. */
type ModalLikeProps = {
    open?: boolean;
    isOpen?: boolean;
    onClose?: () => void;
};

/**
 * Wraps a modal component in its own {@link OrderModalBoundary}.
 *
 * Applied at the `dynamic()` import site so every usage is covered, including
 * modals rendered in more than one place. The boundary is keyed on the open
 * flag, so each time the modal is opened it gets a fresh boundary and a single
 * earlier failure does not leave the dialog permanently dead.
 */
export function withOrderModalBoundary<P extends ModalLikeProps>(
    name: string,
    Modal: React.ComponentType<P>,
): React.ComponentType<P> {
    function BoundedModal(props: P) {
        const isOpen = props.open ?? props.isOpen ?? false;
        return (
            <OrderModalBoundary key={`${name}-${isOpen}`} name={name} onClose={props.onClose}>
                <Modal {...props} />
            </OrderModalBoundary>
        );
    }
    BoundedModal.displayName = `withOrderModalBoundary(${name})`;
    return BoundedModal;
}
