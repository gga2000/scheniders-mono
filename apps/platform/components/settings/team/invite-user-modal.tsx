"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import type { UserRole } from "@/lib/permissions";
import { authedFetch } from "@/lib/authed-fetch";

export function InviteUserModal({ onClose, onUserCreated }: { onClose: () => void; onUserCreated: () => void; }) {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [role, setRole] = useState<UserRole>("employee");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const response = await authedFetch("/api/auth/create-user", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email,
                    password,
                    displayName: displayName || email.split("@")[0],
                    role,
                    tenantId,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || t("team.invite.fail"));
            }

            onUserCreated();
        } catch (err) {
            console.error("Error creating user:", err);
            setError(err instanceof Error ? err.message : t("team.invite.fail"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-background border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{t("team.invite.title")}</h2>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">{t("team.invite.email")}</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-10 px-3 border rounded-lg" required />
                    </div>
                    <div>
                        <label className="text-sm font-medium">{t("team.invite.password")}</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-10 px-3 border rounded-lg" required minLength={8} maxLength={72} />
                    </div>
                    <div>
                        <label className="text-sm font-medium">{t("team.invite.name")}</label>
                        <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full h-10 px-3 border rounded-lg" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">{t("team.invite.role")}</label>
                        <select value={role} onChange={e => setRole(e.target.value as UserRole)} className="w-full h-10 px-3 border rounded-lg">
                            <option value="employee">{t("team.role.employee")}</option>
                            <option value="viewer">{t("team.role.viewer")}</option>
                            <option value="admin">{t("team.role.admin")}</option>
                        </select>
                    </div>
                    {error && (
                        <p role="alert" className="text-sm text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}
                    <button className="w-full bg-primary text-primary-foreground py-2 rounded-lg" disabled={loading}>
                        {loading ? t("team.invite.creating") : t("team.invite.create")}
                    </button>
                </form>
            </motion.div>
        </div>
    )
}
