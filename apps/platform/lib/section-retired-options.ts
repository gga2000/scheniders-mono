// =====================================================================
// Retired section choices — still valid on a stored section, never offered
// for a new one
// =====================================================================
// A clock that restarts on its own (every midnight, or a loop for each
// visitor) is a deadline nobody set, so the editor no longer offers one.
// The values stay in the section schemas: a stored section keeps parsing
// and keeps showing its current choice, so its owner can see and change it.
// The database refuses a new one too (refuse_new_restarting_clocks).
// =====================================================================

import { RESTARTING_COUNTDOWN_MODES } from "@scheniders/sections/helpers/countdown";

const RETIRED_ENUM_OPTIONS: ReadonlySet<string> = new Set(RESTARTING_COUNTDOWN_MODES);

/** The choices an enum control offers: every option except a retired one,
 *  which stays only while it is the field's current value. */
export function offeredEnumOptions(options: readonly string[], current: unknown): string[] {
    return options.filter((opt) => !RETIRED_ENUM_OPTIONS.has(opt) || opt === current);
}
