"use client";

import { motion } from "framer-motion";
import { Sparkles, LogOut, Package, Truck, Users, ShieldCheck } from "lucide-react";

/**
 * Shown when a user authenticates (e.g. via Google) but has no Schenider
 * account provisioned — the invite-only gate. Designed to match the login
 * page's premium glassmorphic aesthetic, with a WhatsApp path to an admin and
 * a short "what is Schenider" section so the visitor understands where they are.
 */

// Configure the support contact in .env: NEXT_PUBLIC_SUPPORT_WHATSAPP=9647XXXXXXXXX
const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/[^0-9]/g, "");

function whatsappLink(email?: string | null): string {
    const msg = `Hi! I'm trying to access Schenider OMS. I signed in with ${email ?? "my Google account"} but my account isn't set up yet. Could you invite me or link my account?`;
    return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`;
}

const HIGHLIGHTS = [
    { icon: Package, label: "Orders", desc: "One workspace for every order" },
    { icon: Truck, label: "Delivery", desc: "Nationwide across Iraq" },
    { icon: Users, label: "Team", desc: "Real-time, role-based ops" },
];

export function AccountNotProvisioned({ email, onSignOut }: { email?: string | null; onSignOut: () => void }) {
    const ease = [0.22, 1, 0.36, 1] as const;

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#FBFAF7]">
            {/* Ambient gradient orbs — matches the login aesthetic */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-[620px] h-[620px] rounded-full opacity-30"
                    style={{ background: "radial-gradient(circle, var(--pastel-yellow) 0%, transparent 70%)", top: "-220px", right: "-180px" }}
                    animate={{ scale: [1, 1.1, 1], y: [0, -20, 0] }}
                    transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute w-[520px] h-[520px] rounded-full opacity-25"
                    style={{ background: "radial-gradient(circle, var(--pastel-mint) 0%, transparent 70%)", bottom: "-180px", left: "-160px" }}
                    animate={{ scale: [1, 1.15, 1], y: [0, 24, 0] }}
                    transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
                />
                {/* faint grid texture */}
                <div
                    className="absolute inset-0 opacity-[0.025]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(30,30,30,1) 1px, transparent 1px), linear-gradient(90deg, rgba(30,30,30,1) 1px, transparent 1px)`,
                        backgroundSize: "56px 56px",
                    }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease }}
                className="w-full max-w-lg relative z-10"
            >
                <div className="bg-white/75 backdrop-blur-2xl rounded-[28px] shadow-2xl border border-white/60 overflow-hidden">
                    {/* Brand bar */}
                    <div className="flex items-center gap-2.5 px-8 pt-7">
                        <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#1E1E1E] to-[#3D3D3D] shadow-md">
                            <Sparkles className="w-4.5 h-4.5 text-[#FBE38E]" />
                        </div>
                        <span className="text-sm font-semibold tracking-tight text-[#1E1E1E]">Schenider</span>
                    </div>

                    {/* Hero */}
                    <div className="px-8 pt-6 text-center">
                        <motion.div
                            initial={{ scale: 0, rotate: -8 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 14 }}
                            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FCF3D6] ring-1 ring-[#F2E2A8] mb-5"
                        >
                            <ShieldCheck className="w-8 h-8 text-[#B8902A]" />
                        </motion.div>

                        <h1 className="text-2xl font-bold text-[#1E1E1E] tracking-tight mb-2">
                            Almost there — your account isn&apos;t set up yet
                        </h1>
                        <p className="text-sm text-[#5C5C5C] leading-relaxed">
                            You signed in
                            {email ? (
                                <> as <span className="font-semibold text-[#1E1E1E]">{email}</span></>
                            ) : null}
                            , but it isn&apos;t linked to a Schenider workspace.
                        </p>

                        <div className="mt-4 mx-auto max-w-sm rounded-2xl bg-[#F6F4EF] border border-[#ECE8E0] px-4 py-3">
                            <p className="text-[13px] text-[#5C5C5C] leading-relaxed">
                                Ask your organization&apos;s admin to <span className="font-medium text-[#1E1E1E]">invite you</span> — or, if you already
                                have a work account, to <span className="font-medium text-[#1E1E1E]">link this Google address</span> to it from their dashboard.
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="px-8 pt-6 space-y-3">
                        {SUPPORT_WHATSAPP ? (
                            <a
                                href={whatsappLink(email)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group w-full h-12 rounded-2xl font-semibold text-white bg-[#25D366] hover:bg-[#1FBE5A]
                                         shadow-lg shadow-green-500/20 hover:shadow-green-500/30
                                         flex items-center justify-center gap-2.5 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.1 3.2 5.07 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35Z" />
                                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.78 1.22h.01c5.46 0 9.9-4.45 9.9-9.91a9.84 9.84 0 0 0-2.9-7A9.84 9.84 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 5.82 2.42 8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23Z" />
                                </svg>
                                Message an admin on WhatsApp
                            </a>
                        ) : (
                            <div className="w-full rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF] px-4 py-3 text-center">
                                <p className="text-[13px] text-[#9F4B5A]">
                                    Contact your organization&apos;s admin to get access.
                                </p>
                            </div>
                        )}

                        <button
                            onClick={onSignOut}
                            className="w-full h-11 rounded-2xl font-medium text-[#5C5C5C] bg-transparent border border-[#E2DDD4]
                                     hover:bg-[#F6F4EF] hover:text-[#1E1E1E] flex items-center justify-center gap-2 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign out
                        </button>
                    </div>

                    {/* About Schenider */}
                    <div className="mt-7 px-8 py-6 bg-[#1E1E1E] text-white">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FBE38E] mb-1.5">
                            What is Schenider?
                        </p>
                        <p className="text-sm text-white/70 leading-relaxed mb-5">
                            The order-management workspace Iraqi merchants use to run orders, delivery, and
                            customers — in real time, as one team.
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {HIGHLIGHTS.map(({ icon: Icon, label, desc }, i) => (
                                <motion.div
                                    key={label}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + i * 0.08, ease }}
                                    className="rounded-2xl bg-white/[0.06] border border-white/10 p-3"
                                >
                                    <Icon className="w-4.5 h-4.5 text-[#FBE38E] mb-2" />
                                    <p className="text-[13px] font-semibold text-white">{label}</p>
                                    <p className="text-[11px] text-white/55 leading-snug mt-0.5">{desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
