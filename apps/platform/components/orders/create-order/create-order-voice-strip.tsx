"use client";

import { useCallback } from "react";
import { Check, Loader2, Mic, Square } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useVoiceRecorder, type RecorderFailure } from "@/hooks/use-voice-recorder";
import { formatVoiceLength } from "@/lib/support/voice";
import { VOICE_ORDER_MAX_SECONDS } from "@/lib/voice/voice-order-limits";
import { cn } from "@/lib/utils";
import type { CreateOrderModel } from "./use-create-order-model";

/**
 * «احجي الطلب»: beside the screenshot reader on New Order. Click, say the
 * order, click again; the customer fields fill themselves for the merchant
 * to check. Hidden where the browser cannot record.
 */
export function CreateOrderVoiceStrip({ m }: { m: CreateOrderModel }) {
    const { t, isAnalyzingVoice, voiceFilled, handleVoiceOrder } = m;
    const onFailure = useCallback(
        (failure: RecorderFailure) => toast.error(t(failure === "blocked" ? "voice.blocked" : "voice.failed")),
        [t],
    );
    const recorder = useVoiceRecorder({ maxSeconds: VOICE_ORDER_MAX_SECONDS, onDone: handleVoiceOrder, onFailure });

    if (!recorder.supported) return null;

    const title = recorder.recording
        ? t("voice.order.listening")
        : isAnalyzingVoice
            ? t("voice.order.reading")
            : voiceFilled
                ? t("voice.order.filled")
                : t("voice.order.title");
    const hint = recorder.recording
        ? `${formatVoiceLength(recorder.seconds)} / ${formatVoiceLength(VOICE_ORDER_MAX_SECONDS)}`
        : isAnalyzingVoice
            ? null
            : voiceFilled
                ? t("voice.order.again")
                : t("voice.order.hint");

    return (
        <button
            type="button"
            onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
            disabled={isAnalyzingVoice}
            aria-pressed={recorder.recording}
            className={cn(
                "flex w-full min-w-0 items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-start transition-all sm:flex-1",
                recorder.recording
                    ? "border-red-400 bg-red-50/60"
                    : isAnalyzingVoice
                        ? "cursor-wait border-purple-300 bg-purple-50/50"
                        : voiceFilled
                            ? "border-purple-400 bg-purple-50/50"
                            : "border-gray-300 bg-gray-50/30 hover:border-purple-400 hover:bg-purple-50/30",
            )}
        >
            {recorder.recording ? (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white motion-safe:animate-pulse">
                    <Square className="h-3 w-3 fill-current" />
                </div>
            ) : isAnalyzingVoice ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-600" />
            ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                    <Mic className="h-4 w-4 text-purple-600" />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <p className={cn("text-xs font-medium", recorder.recording ? "text-red-700" : "text-gray-700")}>{title}</p>
                {hint && (
                    <p className="mt-0.5 text-[11px] tabular-nums text-gray-400">
                        {hint}
                    </p>
                )}
            </div>
            {voiceFilled && !recorder.recording && !isAnalyzingVoice && <Check className="h-4 w-4 shrink-0 text-purple-600" />}
        </button>
    );
}
