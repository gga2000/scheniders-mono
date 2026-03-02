import { supabase } from "@/lib/supabase";

// =============================================
// CIRCUIT BREAKER FOR SUPABASE
// Prevents hammering a down service. After N
// consecutive failures, flips to OPEN state
// (rejects calls immediately) for a cooldown
// period, then allows a single HALF-OPEN probe.
// =============================================

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
    failureThreshold?: number;  // Consecutive failures before opening (default: 5)
    cooldownMs?: number;        // How long to stay open before half-open probe (default: 30s)
    onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
    private state: CircuitState = "CLOSED";
    private consecutiveFailures = 0;
    private lastFailureTime = 0;
    private failureThreshold: number;
    private cooldownMs: number;
    private onStateChange?: (from: CircuitState, to: CircuitState) => void;

    constructor(options: CircuitBreakerOptions = {}) {
        this.failureThreshold = options.failureThreshold ?? 5;
        this.cooldownMs = options.cooldownMs ?? 30_000;
        this.onStateChange = options.onStateChange;
    }

    /**
     * Execute a function through the circuit breaker.
     * Throws CircuitOpenError if the circuit is open.
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if we should attempt the call
        if (this.state === "OPEN") {
            const elapsed = Date.now() - this.lastFailureTime;
            if (elapsed < this.cooldownMs) {
                throw new CircuitOpenError(
                    `Service unavailable — retrying in ${Math.ceil((this.cooldownMs - elapsed) / 1000)}s`
                );
            }
            // Cooldown elapsed → try half-open probe
            this.transition("HALF_OPEN");
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (err) {
            this.onFailure();
            throw err;
        }
    }

    private onSuccess(): void {
        this.consecutiveFailures = 0;
        if (this.state !== "CLOSED") {
            this.transition("CLOSED");
        }
    }

    private onFailure(): void {
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();

        if (this.consecutiveFailures >= this.failureThreshold && this.state === "CLOSED") {
            this.transition("OPEN");
        } else if (this.state === "HALF_OPEN") {
            // Half-open probe failed → back to open
            this.transition("OPEN");
        }
    }

    private transition(newState: CircuitState): void {
        const oldState = this.state;
        this.state = newState;
        this.onStateChange?.(oldState, newState);
    }

    /** Current circuit state */
    getState(): CircuitState {
        return this.state;
    }

    /** Whether calls should be attempted */
    isAvailable(): boolean {
        if (this.state === "CLOSED") return true;
        if (this.state === "OPEN") {
            return Date.now() - this.lastFailureTime >= this.cooldownMs;
        }
        return true; // HALF_OPEN allows one probe
    }

    /** Reset the circuit breaker (e.g., on manual reconnect) */
    reset(): void {
        this.consecutiveFailures = 0;
        this.lastFailureTime = 0;
        if (this.state !== "CLOSED") {
            this.transition("CLOSED");
        }
    }
}

export class CircuitOpenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CircuitOpenError";
    }
}

// =============================================
// SINGLETON INSTANCE
// Shared across the app for all Supabase calls
// =============================================

let _supabaseBreaker: CircuitBreaker | null = null;

export function getSupabaseCircuitBreaker(): CircuitBreaker {
    if (!_supabaseBreaker) {
        _supabaseBreaker = new CircuitBreaker({
            failureThreshold: 5,
            cooldownMs: 30_000,
            onStateChange: (from, to) => {
                console.warn(`[CircuitBreaker] Supabase: ${from} → ${to}`);
            },
        });
    }
    return _supabaseBreaker;
}
