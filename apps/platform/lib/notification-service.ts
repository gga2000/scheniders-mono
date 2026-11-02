/**
 * Desktop Notification Service
 * Handles browser notifications for new orders
 */

export interface NotificationOptions {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    requireInteraction?: boolean;
    onClick?: () => void;
}

class NotificationService {
    private permission: NotificationPermission = "default";

    constructor() {
        if (typeof window !== "undefined") {
            this.permission = Notification.permission;
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

    async showNotification(options: NotificationOptions, isUrgent = false): Promise<void> {
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
                // The bell feed plays the sound; a second one from the popup would double it.
                silent: true,
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
            isUrgent
        );
    }
}

// Singleton instance
export const notificationService = new NotificationService();
