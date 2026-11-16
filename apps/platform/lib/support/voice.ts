/**
 * Voice notes in the Help chat. Browsers record in different containers:
 * Chrome and Android make WebM/Opus, iPhone Safari makes MP4/AAC, Firefox
 * can make Ogg/Opus. The server trusts the bytes, not the label the browser
 * sends, so each kind is recognised by how its file starts.
 */

export interface VoiceKind {
    ext: "webm" | "m4a" | "ogg";
    contentType: "audio/webm" | "audio/mp4" | "audio/ogg";
}

const WEBM: VoiceKind = { ext: "webm", contentType: "audio/webm" };
const MP4: VoiceKind = { ext: "m4a", contentType: "audio/mp4" };
const OGG: VoiceKind = { ext: "ogg", contentType: "audio/ogg" };

/** The recording's kind from its first bytes, or null when it is none of ours. */
export function voiceKind(bytes: Uint8Array): VoiceKind | null {
    if (bytes.length < 12) return null;
    // EBML header (Matroska / WebM).
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return WEBM;
    // "OggS".
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return OGG;
    // ISO base media: a box size, then "ftyp".
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return MP4;
    return null;
}

/** The first container this browser can record, best first; null if none. */
export function recorderType(isSupported: (type: string) => boolean): string | null {
    for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
        if (isSupported(type)) return type;
    }
    return null;
}

/** "0:07", "1:30". */
export function formatVoiceLength(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
