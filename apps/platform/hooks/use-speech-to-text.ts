"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { speechFailure, type HeardPiece, type SpeechFailure } from "@/lib/voice/speech-text";

/**
 * The browser's speech service. TypeScript's DOM library ships the result
 * types but not the service itself, so this is the part of it we use.
 */
interface SpeechService {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

type SpeechServiceClass = new () => SpeechService;

/** Chrome, Edge and Samsung Internet still name it with the webkit prefix. */
function speechServiceClass(): SpeechServiceClass | null {
    if (typeof window === "undefined") return null;
    const scope = window as Window & {
        SpeechRecognition?: SpeechServiceClass;
        webkitSpeechRecognition?: SpeechServiceClass;
    };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const noSubscription = () => () => {};

function piecesOf(results: SpeechRecognitionResultList): HeardPiece[] {
    const pieces: HeardPiece[] = [];
    for (let i = 0; i < results.length; i += 1) {
        const result = results[i];
        pieces.push({ transcript: result[0]?.transcript ?? "", isFinal: result.isFinal });
    }
    return pieces;
}

export interface SpeechToText {
    /** False on the server and in browsers without a speech service (Firefox). */
    supported: boolean;
    listening: boolean;
    start: () => void;
    stop: () => void;
}

/**
 * Listens once: from `start` until the merchant pauses or presses stop.
 * `onHeard` gets everything heard so far each time the service updates,
 * guesses included, so the words show up while they talk.
 */
export function useSpeechToText({ lang, onHeard, onFailure }: {
    lang: string;
    onHeard: (pieces: HeardPiece[]) => void;
    onFailure: (failure: SpeechFailure) => void;
}): SpeechToText {
    const supported = useSyncExternalStore(noSubscription, () => speechServiceClass() !== null, () => false);
    const [listening, setListening] = useState(false);
    const serviceRef = useRef<SpeechService | null>(null);
    const handlers = useRef({ onHeard, onFailure });

    useEffect(() => {
        handlers.current = { onHeard, onFailure };
    }, [onHeard, onFailure]);

    // Leaving the page or closing the form stops the microphone.
    useEffect(() => () => serviceRef.current?.abort(), []);

    const start = useCallback(() => {
        const Service = speechServiceClass();
        if (!Service || serviceRef.current) return;
        const service = new Service();
        service.lang = lang;
        // One phrase per press: the service ends on a pause. Continuous mode
        // repeats earlier phrases inside later results on Android Chrome.
        service.continuous = false;
        service.interimResults = true;
        service.maxAlternatives = 1;
        service.onresult = (event) => handlers.current.onHeard(piecesOf(event.results));
        service.onerror = (event) => {
            const failure = speechFailure(event.error);
            if (failure) handlers.current.onFailure(failure);
        };
        service.onend = () => {
            serviceRef.current = null;
            setListening(false);
        };
        serviceRef.current = service;
        setListening(true);
        try {
            service.start();
        } catch {
            // start() throws only when this service is already running or the
            // page may not use the microphone; either way nothing is listening.
            serviceRef.current = null;
            setListening(false);
            handlers.current.onFailure("failed");
        }
    }, [lang]);

    const stop = useCallback(() => {
        serviceRef.current?.stop();
    }, []);

    return { supported, listening, start, stop };
}
