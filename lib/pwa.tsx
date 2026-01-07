"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";

// =============================================
// Service Worker Registration
// =============================================

export function registerServiceWorker() {
    // Disable SW in development to prevent HMR issues
    if (process.env.NODE_ENV === "development") return;

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        window.addEventListener("load", async () => {
            try {
                const registration = await navigator.serviceWorker.register("/sw.js", {
                    scope: "/",
                });
                console.log("[PWA] Service Worker registered:", registration.scope);

                // Check for updates
                registration.addEventListener("updatefound", () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener("statechange", () => {
                            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                                // New version available
                                console.log("[PWA] New version available!");
                                // Could dispatch event to show update prompt
                                window.dispatchEvent(new CustomEvent("sw-update-available"));
                            }
                        });
                    }
                });
            } catch (err) {
                console.error("[PWA] Service Worker registration failed:", err);
            }
        });
    }
}

// =============================================
// Install Prompt Hook
// =============================================

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWAInstall() {
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    // Initialize installed state lazily to avoid effect setState
    const [isInstalled, setIsInstalled] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia("(display-mode: standalone)").matches;
    });
    // Initialize iOS state lazily
    const [isIOS] = useState(() => {
        if (typeof window === "undefined") return false;
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    });

    useEffect(() => {
        // Skip if already installed
        if (isInstalled) return;

        // Listen for install prompt
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e as BeforeInstallPromptEvent);
            console.log("[PWA] Install prompt captured");
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstall);

        // Listen for successful install
        window.addEventListener("appinstalled", () => {
            setIsInstalled(true);
            setInstallPrompt(null);
            console.log("[PWA] App installed successfully");
        });

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
        };
    }, []);

    const install = async () => {
        if (!installPrompt) return false;

        try {
            await installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            console.log("[PWA] Install prompt outcome:", outcome);

            if (outcome === "accepted") {
                setIsInstalled(true);
                setInstallPrompt(null);
                return true;
            }
        } catch (err) {
            console.error("[PWA] Install failed:", err);
        }

        return false;
    };

    return {
        canInstall: !!installPrompt,
        isInstalled,
        isIOS,
        install,
    };
}

// =============================================
// Install Prompt Banner Component
// =============================================

export function PWAInstallBanner() {
    const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
    // Use lazy initialization to avoid setState in effect
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === "undefined") return false;
        return sessionStorage.getItem("pwa-install-dismissed") === "true";
    });
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);

    const handleDismiss = () => {
        setDismissed(true);
        sessionStorage.setItem("pwa-install-dismissed", "true");
    };

    const handleInstall = async () => {
        const success = await install();
        if (success) {
            handleDismiss();
        }
    };

    // Don't show if installed, dismissed, or no prompt available (except iOS)
    if (isInstalled || dismissed) return null;
    if (!canInstall && !isIOS) return null;

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50"
                >
                    <div className="bg-surface border border-border rounded-2xl p-4 shadow-xl backdrop-blur-xl">
                        <button
                            onClick={handleDismiss}
                            className="absolute top-2 right-2 p-1 rounded-lg hover:bg-surface-hover transition-colors text-muted-foreground"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Download className="w-6 h-6 text-primary" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground mb-1">
                                    تثبيت التطبيق
                                </h3>
                                <p className="text-sm text-muted-foreground mb-3">
                                    ثبّت التطبيق للوصول السريع والاستخدام بدون انترنت
                                </p>

                                {isIOS ? (
                                    <button
                                        onClick={() => setShowIOSInstructions(true)}
                                        className="w-full py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors text-sm"
                                    >
                                        كيفية التثبيت
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleInstall}
                                        className="w-full py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors text-sm"
                                    >
                                        تثبيت الآن
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* iOS Instructions Modal */}
            <AnimatePresence>
                {showIOSInstructions && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowIOSInstructions(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold text-foreground mb-4">
                                تثبيت على iOS
                            </h3>
                            <ol className="space-y-3 text-sm text-muted-foreground">
                                <li className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">1</span>
                                    اضغط على زر المشاركة
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" />
                                    </svg>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">2</span>
                                    اختر &quot;إضافة إلى الشاشة الرئيسية&quot;
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">3</span>
                                    اضغط &quot;إضافة&quot;
                                </li>
                            </ol>
                            <button
                                onClick={() => {
                                    setShowIOSInstructions(false);
                                    handleDismiss();
                                }}
                                className="w-full mt-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-colors text-sm font-medium"
                            >
                                فهمت
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// =============================================
// Online/Offline Status Hook
// =============================================

export function useOnlineStatus() {
    // Use lazy initialization to avoid setState in effect
    const [isOnline, setIsOnline] = useState(() => {
        if (typeof window === "undefined") return true;
        return navigator.onLine;
    });

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    return isOnline;
}

// =============================================
// Offline Indicator Component
// =============================================

export function OfflineIndicator() {
    const isOnline = useOnlineStatus();

    if (isOnline) return null;

    return (
        <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 left-0 right-0 bg-amber-500 text-amber-950 py-2 px-4 text-center text-sm font-medium z-50"
        >
            أنت غير متصل بالإنترنت - البيانات قد تكون غير محدثة
        </motion.div>
    );
}
