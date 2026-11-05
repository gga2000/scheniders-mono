"use client";

import { useEffect, useRef } from "react";
import { CUSTOMER_CHANNEL, HELLO, type DisplayState } from "@/lib/till/customer-display";

/** Posts the till's state to the customer screen, and answers a customer screen that just opened. */
export function useCustomerDisplay(state: DisplayState) {
    const channel = useRef<BroadcastChannel | null>(null);
    const latest = useRef(state);

    useEffect(() => {
        if (typeof BroadcastChannel === "undefined") return;
        const ch = new BroadcastChannel(CUSTOMER_CHANNEL);
        ch.onmessage = (e: MessageEvent) => {
            if (e.data === HELLO) ch.postMessage(latest.current);
        };
        channel.current = ch;
        return () => {
            ch.close();
            channel.current = null;
        };
    }, []);

    useEffect(() => {
        latest.current = state;
        channel.current?.postMessage(state);
    }, [state]);
}
