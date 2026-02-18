"use client";

import React, { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing
 * the entire application.
 * 
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        // Update state so the next render shows the fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        // Log error to console in development
        console.error("ErrorBoundary caught an error:", error);
        console.error("Component stack:", errorInfo.componentStack);

        // In production, you could send this to an error tracking service
        // like Sentry, LogRocket, etc.
    }

    handleReload = (): void => {
        // Clear the error state and try to re-render
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    handleGoHome = (): void => {
        // Navigate to home and clear error state
        this.setState({ hasError: false, error: null });
        window.location.href = "/orders";
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // If a custom fallback is provided, use it
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default fallback UI
            return (
                <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6">
                    <div className="max-w-md w-full bg-[var(--card-bg)] rounded-2xl shadow-xl border border-[var(--card-border)] p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-rose-100 dark:bg-rose-900/20 flex items-center justify-center">
                            <AlertTriangle className="w-8 h-8 text-rose-600" />
                        </div>

                        <h2 className="text-xl font-bold text-foreground mb-2">
                            Something went wrong
                        </h2>

                        <p className="text-muted mb-6">
                            An unexpected error occurred. Please try reloading the page
                            or return to the home screen.
                        </p>

                        {process.env.NODE_ENV === "development" && this.state.error && (
                            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/10 rounded-xl text-left overflow-auto max-h-32">
                                <p className="text-sm font-mono text-rose-700 dark:text-rose-400 break-all">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReload}
                                className="flex items-center gap-2 px-4 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reload Page
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className="flex items-center gap-2 px-4 py-3 bg-[var(--card-border)] text-foreground rounded-xl font-medium hover:bg-[var(--background)] transition-all"
                            >
                                <Home className="w-4 h-4" />
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
