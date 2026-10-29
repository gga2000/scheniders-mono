// =====================================================================
// «احفظ رقمنا» — how the store's number is saved on this device (F01)
// =====================================================================
// One action, three ways, picked by what the device does well:
//   • iPhone / iPad: the vCard data: URL (the same one the thank-you call
//     card ships) opens the system "new contact" sheet;
//   • Android: the vCard as a file through the share sheet, where the
//     Contacts app is a target (no `intent:` URL: D12);
//   • anything else: the number goes to the clipboard.
// The page can never see whether a contact was saved, so the buyer is
// told what happened ("we named it …", "number copied") and never that
// it was saved. A copy is confirmed only after the clipboard resolves.
// =====================================================================

export type SaveRoute = "vcard" | "share" | "copy";

/** What the buyer is told after a tap; null = nothing (they cancelled). */
export type SaveOutcome = "opened" | "copied" | "manual" | null;

export interface SaveEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** `navigator.canShare({ files: [vcf] })`. */
  canShareFile: boolean;
  /** `navigator.clipboard.writeText` exists (secure context). */
  hasClipboard: boolean;
}

/** iPhone, iPod, or an iPad — which reports a desktop Mac user agent but
 *  has a touch screen. */
function isAppleTouch(env: SaveEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function pickSaveRoute(env: SaveEnv): SaveRoute {
  if (isAppleTouch(env)) return "vcard";
  if (/Android/.test(env.userAgent) && env.canShareFile) return "share";
  if (env.hasClipboard) return "copy";
  // No clipboard (an insecure context): the vCard download is all there is.
  return "vcard";
}

export interface SaveIo {
  share?: (file: File) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

async function copyNumber(io: SaveIo, number: string): Promise<SaveOutcome> {
  if (!io.writeText) return "manual";
  try {
    await io.writeText(number);
    return "copied";
  } catch {
    // The clipboard was refused: say so, and ask for the number by hand
    // (it is printed in the band).
    return "manual";
  }
}

/** The share and copy routes (the vCard route is the link's own default
 *  navigation). A share the buyer closes says nothing; any other share
 *  refusal falls back to copying. */
export async function shareOrCopy(
  route: Exclude<SaveRoute, "vcard">,
  io: SaveIo,
  file: File,
  number: string,
): Promise<SaveOutcome> {
  if (route === "share" && io.share) {
    try {
      await io.share(file);
      return "opened";
    } catch (err) {
      // AbortError = the buyer closed the share sheet: nothing happened.
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // Any other refusal (no target, not allowed): copy the number instead.
    }
  }
  return copyNumber(io, number);
}
