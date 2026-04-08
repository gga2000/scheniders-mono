/**
 * Desktop Notification Service
 * Handles browser notifications for new orders
 */

const NOTIFICATION_SOUND_URL = "/sounds/notification.mp3";
const URGENT_SOUND_URL = "/sounds/urgent.mp3";

export interface NotificationOptions {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    requireInteraction?: boolean;
    silent?: boolean;
    onClick?: () => void;
}

class NotificationService {
    private permission: NotificationPermission = "default";
    private audioContext: AudioContext | null = null;
    private notificationSound: HTMLAudioElement | null = null;
    private urgentSound: HTMLAudioElement | null = null;

    private _soundEnabled = true;

    constructor() {
        if (typeof window !== "undefined") {
            this.permission = Notification.permission;
            this.initAudio();
        }
    }

    set soundEnabled(enabled: boolean) {
        this._soundEnabled = enabled;
        if (typeof window !== "undefined") {
            localStorage.setItem("ordersSoundEnabled", String(enabled));
        }
    }

    get soundEnabled(): boolean {
        return this._soundEnabled;
    }

    private initAudio(customUrl?: string) {
        // Pre-load notification sounds with error handling
        if (typeof Audio !== "undefined") {
            try {
                this.notificationSound = new Audio();
                this.notificationSound.volume = 0.5;
                this.notificationSound.preload = "none";
                this.notificationSound.src = customUrl || NOTIFICATION_SOUND_URL;

                this.urgentSound = new Audio();
                this.urgentSound.volume = 0.7;
                this.urgentSound.preload = "none";
                this.urgentSound.src = URGENT_SOUND_URL;
            } catch (error) {
                console.warn("Failed to initialize audio:", error);
            }
        }
    }

    /**
     * Update service settings from global app settings
     */
    updateFromSettings(settings: any) {
        if (!settings) return;

        const notifySettings = settings.notification_settings;
        if (notifySettings) {
            this._soundEnabled = notifySettings.sound_enabled ?? true;
            if (notifySettings.sound_url && this.notificationSound) {
                if (this.notificationSound.src !== window.location.origin + notifySettings.sound_url) {
                    this.notificationSound.src = notifySettings.sound_url;
                }
            }
        }
    }

    async requestPermission(): Promise<boolean> {
        if (typeof window === "undefined") return false;

        if (Notification.permission === "granted") {
            this.permission = "granted";
            return true;
        }

        if (Notification.permission === "denied") {
            this.permission = "denied";
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            return permission === "granted";
        } catch (error) {
            console.error("Failed to request notification permission:", error);
            return false;
        }
    }

    isEnabled(): boolean {
        return this.permission === "granted";
    }

    async showNotification(options: NotificationOptions, playSound = true, isUrgent = false): Promise<void> {
        if (!this.isEnabled()) {
            console.log("Notifications not enabled");
            return;
        }

        try {
            const notification = new Notification(options.title, {
                body: options.body,
                icon: options.icon || "/icon-192.png",
                tag: options.tag || "order-notification",
                requireInteraction: options.requireInteraction || isUrgent,
                silent: options.silent ?? !playSound,
            });

            if (options.onClick) {
                notification.onclick = () => {
                    window.focus();
                    options.onClick?.();
                    notification.close();
                };
            }

            // Auto-close after 10 seconds for non-urgent
            if (!options.requireInteraction && !isUrgent) {
                setTimeout(() => notification.close(), 10000);
            }

            // Play sound
            if (playSound && !options.silent) {
                this.playSound(isUrgent);
            }
        } catch (error) {
            console.error("Failed to show notification:", error);
        }
    }

    async showNewOrderNotification(
        customerName: string,
        orderId: string,
        priority?: string,
        onClick?: () => void
    ): Promise<void> {
        const isUrgent = priority === "urgent";
        const isHighPriority = priority === "high";

        let title = "🛒 New Order!";
        if (isUrgent) title = "🔥 URGENT Order!";
        else if (isHighPriority) title = "⚡ High Priority Order!";

        await this.showNotification(
            {
                title,
                body: `${customerName} placed order #${orderId}`,
                tag: `order-${orderId}`,
                requireInteraction: isUrgent,
                onClick,
            },
            true,
            isUrgent
        );
    }

    async testSound() {
        if (!this._soundEnabled) return;
        this.playSound(false);
    }

    private playSound(urgent = false) {
        if (!this._soundEnabled) return;

        try {
            const sound = urgent ? this.urgentSound : this.notificationSound;
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(() => {
                    // Audio play failed (user hasn't interacted with page yet)
                    console.log("Audio play failed - trying fallback beep");
                    this.playBeep(urgent ? 880 : 440, 200);
                });
            } else {
                this.playBeep(urgent ? 880 : 440, 200);
            }
        } catch (error) {
            console.error("Failed to play notification sound:", error);
            this.playBeep(urgent ? 880 : 440, 200);
        }
    }

    // Play a simple beep using Web Audio API as fallback
    playBeep(frequency = 800, duration = 150) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = "sine";

            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration / 1000);
        } catch (error) {
            console.error("Failed to play beep:", error);
        }
    }
}

// Singleton instance
export const notificationService = new NotificationService();
