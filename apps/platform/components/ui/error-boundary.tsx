"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`[ErrorBoundary] Error in ${this.props.name || "Component"}: `, error, errorInfo);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex min-h-[100px] w-full flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900/50 dark:bg-red-950/20">
                    <AlertCircle className="mb-2 h-6 w-6 text-red-500" />
                    <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
                        {this.props.name || "Component"} Failed to Load
                    </h3>
                    <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80 max-w-[200px] truncate">
                        {this.state.error?.message}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="mt-3 flex items-center text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                    >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
