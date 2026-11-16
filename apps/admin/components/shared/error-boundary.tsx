"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback component name for the error message */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, this.props.name ?? "section", { componentStack: info.componentStack });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="pastel-card p-6 flex flex-col items-center justify-center text-center min-h-[120px]">
          <AlertTriangle className="w-6 h-6 text-amber-500 mb-2" />
          <p className="text-sm font-semibold text-foreground/70">
            {this.props.name ? `${this.props.name} failed to load` : "Something went wrong"}
          </p>
          <p className="text-xs text-foreground/40 mt-1 max-w-xs">The error was reported.</p>
          <button
            onClick={this.handleRetry}
            className="mt-3 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-foreground/60 hover:text-foreground border border-[var(--card-border)] hover:border-foreground/30 transition-all flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
