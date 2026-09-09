// =====================================================================
// Section drop reporting
// =====================================================================
// Shared by the server-side resolver (`RenderSection`) and the client
// error boundary (`_section-error-boundary`). Lives in its own module so
// both worlds can call it: a "use client" module's exports become opaque
// client references when imported from a server component, so a function
// exported from the boundary module would not be callable on the server.
// =====================================================================

export type SectionDropReason =
  | "unknown_type"
  | "schema_invalid"
  | "render_error";

/**
 * Surface a silently-dropped section. In dev we warn to the console; in
 * prod we report to Sentry IF the host app has put it on the global —
 * sections is a framework-neutral shared lib, so we avoid a hard
 * `@sentry/*` dependency. The caller still degrades to `null`.
 */
export function reportSectionDrop(
  reason: SectionDropReason,
  type: string,
  detail?: unknown,
): void {
  if (process.env.NODE_ENV !== "production") {
    // Dev-only diagnostic: the whole point of this branch is a console warning.
    // eslint-disable-next-line no-console
    console.warn(`[sections] dropped "${type}": ${reason}`, detail ?? "");
    return;
  }
  const sentry = (
    globalThis as {
      Sentry?: { captureMessage?: (m: string, c?: unknown) => void };
    }
  ).Sentry;
  sentry?.captureMessage?.(`section_dropped:${reason}`, {
    level: "warning",
    extra: { type, detail },
  });
}
