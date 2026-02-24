"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageCircle, AlertTriangle } from "lucide-react";

interface BroadcastModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCount: number;
    // We pass an array of phone numbers to actually send to/generate links for
    selectedPhones: string[];
}

export function BroadcastModal({ isOpen, onClose, selectedCount, selectedPhones }: BroadcastModalProps) {
    const [message, setMessage] = useState("");
    const [method, setMethod] = useState<"whatsapp" | "sms">("whatsapp");

    if (!isOpen) return null;

    const handleSend = () => {
        if (!message.trim()) return;

        // For V1, since we don't have a backend WhatsApp Business API wired up, 
        // we will generate a comma-separated list of links or a mailto/sms equivalent.
        // A direct "bulk open" on the web isn't feasible for 500 people due to popup blockers.

        // Let's create a visual alert for now, and copy a list of links to clipboard as a fallback workflow
        const encodedMessage = encodeURIComponent(message);

        if (method === "whatsapp") {
            const links = selectedPhones.map(phone => `https://wa.me/${phone}?text=${encodedMessage}`);
            const textToCopy = `Bulk Campaign Links:\n\n${links.join('\n')}`;

            navigator.clipboard.writeText(textToCopy).then(() => {
                alert(`Generated WhatsApp Links for ${selectedCount} customers and copied them to your clipboard.\n\n(In the future, this will connect directly to the WhatsApp Business API for true one-click broadcasting.)`);
            });
        } else {
            // SMS fallback logic (e.g., using a native sms: protocol if on mobile)
            const phoneString = selectedPhones.join(",");
            window.open(`sms:${phoneString}?body=${encodedMessage}`, "_blank");
        }

        setMessage("");
        onClose();
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-lg bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                >
                    <div className="p-5 border-b border-[var(--card-border)] flex items-center justify-between bg-[var(--background)]">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <MessageCircle className="w-5 h-5 text-[var(--ink)]" />
                                Broadcast Message
                            </h2>
                            <p className="text-sm text-muted mt-1">
                                Sending to {selectedCount} selected {selectedCount === 1 ? 'customer' : 'customers'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 -mr-2 rounded-xl text-muted hover:text-foreground hover:bg-[var(--card-border)] transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-5 flex-1 relative bg-[var(--card-bg)]">

                        <div className="flex gap-2 mb-4 p-1 bg-[var(--background)] border border-[var(--card-border)] rounded-xl">
                            <button
                                onClick={() => setMethod("whatsapp")}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors ${method === "whatsapp" ? "bg-green-500 text-white shadow-sm border-transparent" : "text-muted hover:text-foreground"
                                    }`}
                            >
                                <MessageCircle className="w-4 h-4" />
                                WhatsApp
                            </button>
                            <button
                                onClick={() => setMethod("sms")}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors ${method === "sms" ? "bg-blue-500 text-white shadow-sm border-transparent" : "text-muted hover:text-foreground"
                                    }`}
                            >
                                <Send className="w-4 h-4" />
                                SMS
                            </button>
                        </div>

                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 flex gap-3 text-blue-800 text-sm">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-blue-500" />
                            <p>
                                <strong>V1 Note:</strong> Currently generates deep-links to your clipboard for WhatsApp. A true API integration is planned for later phases. SMS will attempt to open your computer's native messaging app.
                            </p>
                        </div>

                        <label className="block text-sm font-bold text-[var(--foreground-muted)] mb-2 uppercase tracking-wide">
                            Message Body
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={`e.g. "Hi! We have a special discount for our top customers..."`}
                            className="w-full p-4 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm min-h-[150px] resize-y focus:outline-none focus:ring-2 focus:ring-[var(--ink)] focus:border-transparent transition-all"
                        />
                        <p className="text-xs text-muted text-right mt-2">
                            {message.length} characters
                        </p>
                    </div>

                    <div className="p-5 border-t border-[var(--card-border)] bg-[var(--background)] flex items-center justify-between gap-3">
                        <button
                            onClick={onClose}
                            className="py-2.5 px-6 bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground hover:bg-[var(--card-border)] font-medium rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!message.trim() || selectedCount === 0}
                            className={`py-2.5 px-6 font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50
                                ${method === "whatsapp" ? "bg-green-600 text-white hover:bg-green-700" : "bg-blue-600 text-white hover:bg-blue-700"}
                            `}
                        >
                            <Send className="w-4 h-4" />
                            {method === "whatsapp" ? "Generate Links" : "Open SMS App"}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
