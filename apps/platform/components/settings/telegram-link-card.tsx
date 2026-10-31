"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Copy, Check, Send, Unlink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
    getTelegramLinkStatusAction,
    generateTelegramLinkCodeAction,
    unlinkTelegramAction,
    type TelegramLinkStatus,
} from "@/app/actions/telegram-link";
import { useAuth } from "@/components/auth/auth-provider";

interface Props {
    userProfileId: string;
    currentAdminId?: string;
    displayName: string;
}

const BOT_HANDLE = "Scheniderbot";

export function TelegramLinkCard({ userProfileId, currentAdminId, displayName }: Props) {
    const { tenantId, session } = useAuth();
    const [status, setStatus] = useState<TelegramLinkStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    const [copied, setCopied] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const s = await getTelegramLinkStatusAction(userProfileId, tenantId, session?.access_token ?? "");
            setStatus(s);
        } finally {
            setLoading(false);
        }
    }, [userProfileId, tenantId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const onGenerate = async () => {
        if (!tenantId) {
            toast.error("Tenant context required");
            return;
        }
        setGenerating(true);
        const res = await generateTelegramLinkCodeAction(userProfileId, tenantId, currentAdminId, session?.access_token ?? "");
        setGenerating(false);
        if (res.success) {
            toast.success("تم توليد كود الربط");
            await refresh();
        } else {
            toast.error(res.error || "Failed to generate code");
        }
    };

    const onUnlink = async () => {
        if (!confirm(`فك ربط ${displayName} عن تليكرام؟`)) return;
        setUnlinking(true);
        const res = await unlinkTelegramAction(userProfileId, tenantId, session?.access_token ?? "");
        setUnlinking(false);
        if (res.success) {
            toast.success("تم فك الربط");
            await refresh();
        } else {
            toast.error(res.error || "Failed to unlink");
        }
    };

    const onCopy = async (code: string) => {
        const text = `/start ${code}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success("تم النسخ");
        } catch {
            toast.error("Couldn't copy");
        }
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-500" />
                Telegram Bot
            </label>
            <div className="rounded-xl border border-border bg-background p-4">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading…
                    </div>
                ) : status?.linked ? (
                    <LinkedView status={status} onUnlink={onUnlink} unlinking={unlinking} />
                ) : status?.active_code ? (
                    <ActiveCodeView
                        code={status.active_code.code}
                        expiresAt={status.active_code.expires_at}
                        onRegenerate={onGenerate}
                        generating={generating}
                        copied={copied}
                        onCopy={onCopy}
                    />
                ) : (
                    <NoLinkView onGenerate={onGenerate} generating={generating} />
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                ربط حساب الموظف ببوت{" "}
                <a href={`https://t.me/${BOT_HANDLE}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                    @{BOT_HANDLE}
                </a>{" "}
                ليرسل صور المحادثات ويُنشئ طلبات تلقائياً.
            </p>
        </div>
    );
}

function NoLinkView({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
                <p className="font-medium">Not linked</p>
                <p className="text-muted-foreground">
                    Generate a one-time code, share it with the employee, and they message{" "}
                    <span className="font-mono mx-1">/start CODE</span>
                    to the bot.
                </p>
            </div>
            <button
                onClick={onGenerate}
                disabled={generating}
                className="shrink-0 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
                {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Generate code
            </button>
        </div>
    );
}

function ActiveCodeView({
    code,
    expiresAt,
    onRegenerate,
    generating,
    copied,
    onCopy,
}: {
    code: string;
    expiresAt: string;
    onRegenerate: () => void;
    generating: boolean;
    copied: boolean;
    onCopy: (code: string) => void;
}) {
    const expiresIn = formatExpiresIn(expiresAt);
    return (
        <div className="space-y-3">
            <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">Code generated — not yet used</p>
                <p className="text-muted-foreground">Send the employee these instructions. The code expires in {expiresIn}.</p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border/60 p-3 font-mono text-sm">
                <div className="text-xs text-muted-foreground mb-1">Open</div>
                <div className="mb-2">
                    <a href={`https://t.me/${BOT_HANDLE}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                        t.me/{BOT_HANDLE}
                    </a>
                </div>
                <div className="text-xs text-muted-foreground mb-1">And send</div>
                <div className="flex items-center justify-between gap-2 bg-background rounded-md border border-border px-3 py-2">
                    <span className="select-all">/start {code}</span>
                    <button
                        onClick={() => onCopy(code)}
                        className="text-sky-600 hover:text-sky-700 inline-flex items-center gap-1 text-xs font-medium font-sans"
                    >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>
            </div>
            <div className="flex justify-end">
                <button
                    onClick={onRegenerate}
                    disabled={generating}
                    className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                >
                    {generating ? "Regenerating…" : "Generate a new code (invalidates this one)"}
                </button>
            </div>
        </div>
    );
}

function LinkedView({
    status,
    onUnlink,
    unlinking,
}: {
    status: TelegramLinkStatus;
    onUnlink: () => void;
    unlinking: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="text-sm min-w-0">
                <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Linked
                </p>
                <p className="text-muted-foreground truncate">
                    {status.telegram_username ? `@${status.telegram_username}` : `Telegram ID ${status.telegram_user_id}`}
                    {status.linked_at && <span className="opacity-70"> · since {new Date(status.linked_at).toLocaleDateString()}</span>}
                </p>
            </div>
            <button
                onClick={onUnlink}
                disabled={unlinking}
                className="shrink-0 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 text-sm font-medium hover:bg-rose-500/20 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
                {unlinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                Unlink
            </button>
        </div>
    );
}

function formatExpiresIn(expiresAt: string): string {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return "expired";
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    if (hours > 1) return `${hours}h`;
    const minutes = Math.floor(diffMs / (60 * 1000));
    return `${minutes}m`;
}
