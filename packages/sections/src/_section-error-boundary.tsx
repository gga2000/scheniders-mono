// =====================================================================
// Per-section error boundary (EC10)
// =====================================================================
// A runtime throw inside ONE section component (a null deref, a bad
// `new URL()`, a non-allowlisted next/image host, a hook error) must NOT
// take down the whole page — without this it propagates to the
// route-level error.tsx and white-screens header + footer + every other
// valid section. On error we drop just this section (render null) and
// report it via the same path as a schema-invalid degrade.
//
// Error boundaries are class components, so this is a client module. The
// server-side `RenderSection` passes the (server-rendered) section
// element in as `children` — a server component may hand a client
// boundary any serialisable props, and a React element tree is one.
// `sectionType` is a string rather than an `onError` callback because
// functions cannot cross the server → client boundary.
// =====================================================================

"use client";

import * as React from "react";
import { reportSectionDrop } from "./_report";

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  /** `SectionInstance.type` — named in the drop report. */
  sectionType: string;
}

export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(): void {
    reportSectionDrop("render_error", this.props.sectionType);
  }
  render(): React.ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
