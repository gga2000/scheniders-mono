# Store Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the V1 StoreBuilderEditor at `/store` with a polished merchant Command Center hub that surfaces live preview, KPIs, store health, pages, and settings tiles — all matching the platform's glass-card design language.

**Architecture:** A single `"use client"` page (`app/store/page.tsx`) assembles six focused sub-components living under `apps/platform/components/store-command-center/`. Data is sourced from TanStack Query (`useQuery` on `tenants`, `useStoreAnalytics`, `useStorefrontUrl`) and the pure `runHealthChecks`/`emptyStoreConfigV2` helpers from `@scheniders/shared`. No new dependencies needed — `qrcode` already installed.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Tailwind v4, Lucide React, `@scheniders/shared` (health-rules, emptyStoreConfigV2, formatIQD), `qrcode` (QR code for Share dialog)

---

## File Map

| File | Created/Modified | Responsibility |
|------|-----------------|----------------|
| `apps/platform/app/store/page.tsx` | Modify | Replace V1 editor mount with Command Center; extend tenant query to include `status, store_config_v2, store_config_v2_draft` |
| `apps/platform/components/store-command-center/index.ts` | Create | Barrel export |
| `apps/platform/components/store-command-center/command-center.tsx` | Create | Top-level assembler; all hooks live here; 2-col grid layout |
| `apps/platform/components/store-command-center/header-bar.tsx` | Create | business_name + status pill + Visit store + Customize buttons |
| `apps/platform/components/store-command-center/preview-card.tsx` | Create | iframe live preview with desktop/mobile toggle + faux browser chrome |
| `apps/platform/components/store-command-center/kpi-strip.tsx` | Create | 3 stat cards: Orders, Revenue (IQD), AOV |
| `apps/platform/components/store-command-center/health-card.tsx` | Create | runHealthChecks score ring + top failing checks list |
| `apps/platform/components/store-command-center/pages-card.tsx` | Create | List of store pages with section count + Edit links |
| `apps/platform/components/store-command-center/settings-tiles.tsx` | Create | Brand, Languages, SEO, Custom domain, Share tiles |
| `apps/platform/components/store-command-center/share-dialog.tsx` | Create | Copy URL dialog + QR code via `qrcode` package |

---

### Task 1: Extend tenant query in `app/store/page.tsx`

**Files:**
- Modify: `apps/platform/app/store/page.tsx`

- [ ] **Step 1: Replace the entire file** with the new page that imports `CommandCenter` (to be created in Task 2) and passes enriched tenant data. The query now selects `id, slug, business_name, store_config, status, store_config_v2, store_config_v2_draft`.

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CommandCenter } from "@/components/store-command-center";
import type { StoreConfigV2 } from "@scheniders/shared";

export default function StoreBuilderPage() {
    const { tenantId } = useAuth();

    const { data: tenant, isLoading } = useQuery({
        queryKey: ["tenant-store", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("id, slug, business_name, store_config, status, store_config_v2, store_config_v2_draft")
                .eq("id", tenantId!)
                .single();
            if (error) throw error;
            return data as {
                id: string;
                slug: string;
                business_name: string;
                store_config: Record<string, unknown> | null;
                status: string | null;
                store_config_v2: StoreConfigV2 | null;
                store_config_v2_draft: StoreConfigV2 | null;
            };
        },
        enabled: !!tenantId,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading store...
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                No store found. Please contact support.
            </div>
        );
    }

    return (
        <CommandCenter
            tenant={tenant}
            tenantId={tenantId!}
        />
    );
}
```

- [ ] **Step 2: Confirm V1 components are no longer mounted** — `StoreBuilderEditor` import is removed; no banner. The V1 component files themselves (`components/store-builder/`) are untouched.

---

### Task 2: Create `header-bar.tsx`

**Files:**
- Create: `apps/platform/components/store-command-center/header-bar.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";

interface StoreStatus {
    published: boolean;
    hasDraft: boolean;
}

interface HeaderBarProps {
    businessName: string;
    status: StoreStatus;
    storefrontUrl: string;
}

function StatusPill({ status }: { status: StoreStatus }) {
    if (status.published && !status.hasDraft) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
            </span>
        );
    }
    if (status.hasDraft) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unpublished changes
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Draft
        </span>
    );
}

export function HeaderBar({ businessName, status, storefrontUrl }: HeaderBarProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">{businessName}</h1>
                <StatusPill status={status} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <a
                    href={storefrontUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visit store
                </a>
                <Link
                    href="/store/edit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    Customize
                </Link>
            </div>
        </div>
    );
}
```

---

### Task 3: Create `preview-card.tsx`

**Files:**
- Create: `apps/platform/components/store-command-center/preview-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { Monitor, Smartphone, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewCardProps {
    storefrontUrl: string;
}

type ViewMode = "desktop" | "mobile";

export function PreviewCard({ storefrontUrl }: PreviewCardProps) {
    const [mode, setMode] = useState<ViewMode>("desktop");
    const [loaded, setLoaded] = useState(false);

    return (
        <div className="glass-card rounded-2xl border border-border overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[var(--pastel-blue,#dbeafe)] flex items-center justify-center">
                        <Globe className="w-3.5 h-3.5 text-blue-700" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Live preview</span>
                </div>
                <div className="flex items-center gap-1 bg-background rounded-lg border border-border p-0.5">
                    <button
                        onClick={() => setMode("desktop")}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                            mode === "desktop"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Monitor className="w-3 h-3" />
                        Desktop
                    </button>
                    <button
                        onClick={() => setMode("mobile")}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                            mode === "mobile"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Smartphone className="w-3 h-3" />
                        Mobile
                    </button>
                </div>
            </div>

            {/* Faux browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
                <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 bg-background border border-border rounded-md px-3 py-1 text-xs text-muted-foreground font-mono truncate">
                    {storefrontUrl}
                </div>
            </div>

            {/* iframe container */}
            <div className="flex justify-center bg-muted/10 p-4" style={{ minHeight: 480 }}>
                <div
                    className={cn(
                        "relative rounded-xl overflow-hidden border border-border shadow-md transition-all duration-300 bg-white",
                        mode === "desktop" ? "w-full" : "w-[390px]"
                    )}
                    style={{ height: 480 }}
                >
                    {!loaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs">Loading preview…</span>
                            </div>
                        </div>
                    )}
                    <iframe
                        src={storefrontUrl}
                        className="w-full h-full"
                        onLoad={() => setLoaded(true)}
                        title="Store preview"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                    />
                </div>
            </div>
        </div>
    );
}
```

---

### Task 4: Create `kpi-strip.tsx`

**Files:**
- Create: `apps/platform/components/store-command-center/kpi-strip.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { ShoppingBag, Banknote, TrendingUp } from "lucide-react";
import { formatIQD } from "@scheniders/shared";
import type { StoreAnalytics } from "@/hooks/use-store-analytics";

interface KpiStripProps {
    analytics: StoreAnalytics | undefined;
    isLoading: boolean;
}

interface KpiCardProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    sub?: string;
    loading: boolean;
}

function KpiCard({ label, value, icon, sub, loading }: KpiCardProps) {
    return (
        <div className="glass-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    {icon}
                </div>
            </div>
            {loading ? (
                <div className="h-8 w-24 rounded-lg bg-muted animate-pulse" />
            ) : (
                <span className="text-2xl font-bold text-foreground tracking-tight">{value}</span>
            )}
            {sub && !loading && (
                <span className="text-[11px] text-muted-foreground">{sub}</span>
            )}
        </div>
    );
}

export function KpiStrip({ analytics, isLoading }: KpiStripProps) {
    const orderCount = analytics?.orderCount ?? 0;
    const revenue = analytics?.revenue ?? 0;
    const aov = orderCount > 0 ? revenue / orderCount : null;

    return (
        <div className="grid grid-cols-3 gap-3">
            <KpiCard
                label="Orders"
                value={isLoading ? "—" : String(orderCount)}
                icon={<ShoppingBag className="w-4 h-4" />}
                sub="Last 7 days"
                loading={isLoading}
            />
            <KpiCard
                label="Revenue"
                value={isLoading ? "—" : formatIQD(revenue)}
                icon={<Banknote className="w-4 h-4" />}
                sub="Last 7 days"
                loading={isLoading}
            />
            <KpiCard
                label="Avg. order value"
                value={isLoading ? "—" : aov !== null ? formatIQD(aov) : "—"}
                icon={<TrendingUp className="w-4 h-4" />}
                sub={orderCount === 0 ? "No orders yet" : undefined}
                loading={isLoading}
            />
        </div>
    );
}
```

---

### Task 5: Create `health-card.tsx`

**Files:**
- Create: `apps/platform/components/store-command-center/health-card.tsx`

- [ ] **Step 1: Create the file** — uses `runHealthChecks` + `emptyStoreConfigV2` from `@scheniders/shared`; renders score ring + top 4 non-passing checks

```tsx
"use client";

import Link from "next/link";
import { HeartPulse, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { runHealthChecks, emptyStoreConfigV2 } from "@scheniders/shared";
import type { StoreConfigV2 } from "@scheniders/shared";

interface HealthCardProps {
    config: StoreConfigV2 | null;
}

function scoreColor(score: number): string {
    if (score < 40) return "#ef4444";
    if (score < 70) return "#f59e0b";
    if (score < 85) return "#22d3a5";
    return "#16a34a";
}

function scoreLabel(score: number): string {
    if (score < 40) return "Needs attention";
    if (score < 70) return "Getting there";
    if (score < 85) return "Looking good";
    return "Launch-ready";
}

/** Simple SVG ring showing the score 0–100. */
function ScoreRing({ score }: { score: number }) {
    const r = 32;
    const circ = 2 * Math.PI * r;
    const filled = (score / 100) * circ;
    const color = scoreColor(score);

    return (
        <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
            <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
            <circle
                cx="40" cy="40" r={r} fill="none"
                stroke={color} strokeWidth="8"
                strokeDasharray={`${filled} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
            <text x="40" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>
                {score}
            </text>
        </svg>
    );
}

export function HealthCard({ config }: HealthCardProps) {
    const report = runHealthChecks(config ?? emptyStoreConfigV2());
    const { score, checks } = report;

    // Top 4 failing or warning checks
    const issues = checks
        .filter((c) => c.status !== "pass")
        .sort((a, b) => {
            const order = { fail: 0, warn: 1 };
            return (order[a.status as "fail" | "warn"] ?? 2) - (order[b.status as "fail" | "warn"] ?? 2);
        })
        .slice(0, 4);

    return (
        <div className="glass-card rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--pastel-green,#dcfce7)] flex items-center justify-center">
                    <HeartPulse className="w-4 h-4 text-emerald-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Store health</h3>
            </div>

            <div className="flex items-start gap-4 mb-5">
                <ScoreRing score={score} />
                <div className="flex flex-col justify-center gap-1">
                    <p className="text-sm font-semibold text-foreground">{scoreLabel(score)}</p>
                    <p className="text-xs text-muted-foreground">
                        {issues.length === 0
                            ? "All checks passing — store is launch-ready."
                            : `${issues.length} item${issues.length !== 1 ? "s" : ""} to address before launch.`}
                    </p>
                </div>
            </div>

            {issues.length > 0 && (
                <div className="space-y-2">
                    {issues.map((check) => (
                        <div key={check.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                            {check.status === "fail" ? (
                                <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                            ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            )}
                            <p className="text-xs text-foreground flex-1">{check.message ?? check.id}</p>
                            <Link
                                href="/store/edit"
                                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                            >
                                Fix
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            {issues.length === 0 && (
                <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-medium">All checks passing</span>
                </div>
            )}

            <Link
                href="/store/edit"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
                Full checklist in editor <ArrowRight className="w-3 h-3" />
            </Link>
        </div>
    );
}
```

---

### Task 6: Create `pages-card.tsx`

**Files:**
- Create: `apps/platform/components/store-command-center/pages-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import Link from "next/link";
import { LayoutGrid, ArrowRight } from "lucide-react";
import type { PageId, StoreConfigV2 } from "@scheniders/shared";

interface PagesCardProps {
    config: StoreConfigV2 | null;
}

const PAGE_LABELS: Record<PageId, string> = {
    home: "Home",
    category: "Category",
    product: "Product page",
    search: "Search",
    cart: "Cart",
    checkout: "Checkout",
    checkout_success: "Order confirmed",
    track: "Track order",
    about: "About",
    faq: "FAQ",
    contact: "Contact",
    policy_shipping: "Shipping policy",
    policy_returns: "Returns policy",
    policy_privacy: "Privacy policy",
    policy_terms: "Terms of service",
    not_found: "404 page",
};

export function PagesCard({ config }: PagesCardProps) {
    const pages = config?.pages ?? [];

    return (
        <div className="glass-card rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--pastel-purple,#ede9fe)] flex items-center justify-center">
                    <LayoutGrid className="w-4 h-4 text-violet-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Pages</h3>
                <span className="ml-auto text-xs text-muted-foreground">{pages.length} pages</span>
            </div>

            {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No pages configured. Open the editor to start.</p>
            ) : (
                <div className="space-y-1.5">
                    {pages.map((page) => (
                        <div key={page.page_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors group">
                            <span className="text-sm font-medium text-foreground flex-1">
                                {PAGE_LABELS[page.page_id] ?? page.page_id}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                {page.sections.length} section{page.sections.length !== 1 ? "s" : ""}
                            </span>
                            <Link
                                href="/store/edit"
                                className="text-[11px] font-semibold text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all flex items-center gap-0.5"
                            >
                                Edit <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
```

---

### Task 7: Create `share-dialog.tsx`

**Files:**
- Create: `apps/platform/components/store-command-center/share-dialog.tsx`

- [ ] **Step 1: Create the file** — uses `qrcode` package to generate a data-URL, shows copy button

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, QrCode } from "lucide-react";
import QRCode from "qrcode";

interface ShareDialogProps {
    url: string;
    businessName: string;
    onClose: () => void;
}

export function ShareDialog({ url, businessName, onClose }: ShareDialogProps) {
    const [copied, setCopied] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: "#18181b", light: "#ffffff" } })
            .then(setQrDataUrl)
            .catch(() => setQrDataUrl(null));
    }, [url]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const copy = async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div
                ref={dialogRef}
                className="relative glass-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-2xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-foreground">Share your store</h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">{businessName}</p>

                {/* QR Code */}
                <div className="flex justify-center mb-4">
                    {qrDataUrl ? (
                        <img
                            src={qrDataUrl}
                            alt="Store QR code"
                            width={160}
                            height={160}
                            className="rounded-xl border border-border"
                        />
                    ) : (
                        <div className="w-40 h-40 rounded-xl border border-border bg-muted/40 flex items-center justify-center">
                            <QrCode className="w-8 h-8 text-muted-foreground" />
                        </div>
                    )}
                </div>

                {/* URL + copy */}
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                    <span className="flex-1 text-xs text-foreground font-mono truncate">{url}</span>
                    <button
                        onClick={copy}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

---

### Task 8: Create `settings-tiles.tsx`

**Files:**
- Create: `apps/platform/components/store-command-center/settings-tiles.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Palette, Globe2, Search, LinkIcon, Share2 } from "lucide-react";
import { ShareDialog } from "./share-dialog";

interface SettingsTilesProps {
    storefrontUrl: string;
    businessName: string;
}

interface TileProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    onClick?: () => void;
    href?: string;
}

function Tile({ icon, label, description, onClick, href }: TileProps) {
    const inner = (
        <div className="glass-card rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-muted/20 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                {icon}
            </div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
        </div>
    );

    if (href) {
        return <Link href={href}>{inner}</Link>;
    }
    return <button onClick={onClick} className="text-left">{inner}</button>;
}

export function SettingsTiles({ storefrontUrl, businessName }: SettingsTilesProps) {
    const [shareOpen, setShareOpen] = useState(false);

    return (
        <>
            <div className="glass-card rounded-2xl border border-border p-6">
                <h3 className="text-base font-semibold text-foreground mb-4">Quick settings</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Tile
                        href="/store/edit"
                        icon={<Palette className="w-4 h-4" />}
                        label="Brand & theme"
                        description="Logo, colors, fonts, shapes"
                    />
                    <Tile
                        href="/store/edit"
                        icon={<Globe2 className="w-4 h-4" />}
                        label="Languages"
                        description="Arabic, English, Kurdish"
                    />
                    <Tile
                        href="/store/edit"
                        icon={<Search className="w-4 h-4" />}
                        label="SEO"
                        description="Page titles & meta descriptions"
                    />
                    <Tile
                        href="/store/edit"
                        icon={<LinkIcon className="w-4 h-4" />}
                        label="Custom domain"
                        description="Connect your own domain"
                    />
                    <Tile
                        onClick={() => setShareOpen(true)}
                        icon={<Share2 className="w-4 h-4" />}
                        label="Share"
                        description="Get a link or QR code for your store"
                    />
                </div>
            </div>

            {shareOpen && (
                <ShareDialog
                    url={storefrontUrl}
                    businessName={businessName}
                    onClose={() => setShareOpen(false)}
                />
            )}
        </>
    );
}
```

---

### Task 9: Create `command-center.tsx` (assembler)

**Files:**
- Create: `apps/platform/components/store-command-center/command-center.tsx`

- [ ] **Step 1: Create the assembler that wires all sub-components together**

```tsx
"use client";

import type { StoreConfigV2 } from "@scheniders/shared";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { HeaderBar } from "./header-bar";
import { PreviewCard } from "./preview-card";
import { KpiStrip } from "./kpi-strip";
import { HealthCard } from "./health-card";
import { PagesCard } from "./pages-card";
import { SettingsTiles } from "./settings-tiles";

interface Tenant {
    id: string;
    slug: string;
    business_name: string;
    store_config: Record<string, unknown> | null;
    status: string | null;
    store_config_v2: StoreConfigV2 | null;
    store_config_v2_draft: StoreConfigV2 | null;
}

interface CommandCenterProps {
    tenant: Tenant;
    tenantId: string;
}

export function CommandCenter({ tenant, tenantId }: CommandCenterProps) {
    const analyticsQuery = useStoreAnalytics(tenantId);
    const storefrontUrl = useStorefrontUrl(tenant.slug, tenantId);

    const storeStatus = {
        published: !!tenant.store_config_v2 && tenant.status === "active",
        hasDraft: !!tenant.store_config_v2_draft,
    };

    return (
        <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto space-y-6">
            <HeaderBar
                businessName={tenant.business_name}
                status={storeStatus}
                storefrontUrl={storefrontUrl}
            />

            {/* 2-column desktop layout, stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
                {/* Left column */}
                <div className="space-y-6">
                    <PreviewCard storefrontUrl={storefrontUrl} />
                    <KpiStrip
                        analytics={analyticsQuery.data}
                        isLoading={analyticsQuery.isLoading}
                    />
                </div>

                {/* Right column */}
                <div className="space-y-6">
                    <HealthCard config={tenant.store_config_v2} />
                    <PagesCard config={tenant.store_config_v2} />
                    <SettingsTiles
                        storefrontUrl={storefrontUrl}
                        businessName={tenant.business_name}
                    />
                </div>
            </div>
        </div>
    );
}
```

---

### Task 10: Create the barrel export `index.ts`

**Files:**
- Create: `apps/platform/components/store-command-center/index.ts`

- [ ] **Step 1: Create the file**

```ts
export { CommandCenter } from "./command-center";
```

---

### Task 11: Type-check + lint

- [ ] **Step 1: Run type-check**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
cd /Users/ali/scheniders-store-builder
rm -rf apps/platform/.next
corepack pnpm run type-check 2>&1 | grep -E "Tasks:|error TS" | tail -6
```

Expected: `Tasks: 3 successful, 3 total` with no `error TS` lines.

- [ ] **Step 2: Run lint**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
cd /Users/ali/scheniders-store-builder
corepack pnpm run lint 2>&1 | grep -E "Tasks:|errors" | tail -3
```

Expected: `Tasks: 3 successful` and `0 errors`.

- [ ] **Step 3: Fix any errors before moving to the commit**

---

### Task 12: Commit

- [ ] **Step 1: Stage and commit**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
cd /Users/ali/scheniders-store-builder
git add apps/platform/app/store/page.tsx apps/platform/components/store-command-center/
git commit -m "feat(builder): Store Command Center hub at /store (live preview, KPIs, health, pages, settings)"
```

---

## Self-Review

**Spec coverage:**
- [x] Header bar: business_name, status pill (Live/Unpublished/Draft), Visit store, Customize → `/store/edit` — Task 2
- [x] Live preview iframe with desktop/mobile toggle + faux browser chrome — Task 3
- [x] KPI strip: Orders, Revenue (IQD), AOV (divide-by-zero guarded) — Task 4
- [x] Store health: score ring + top 4 failing checks + "Fix in editor" — Task 5
- [x] Pages card: page list with friendly names, section counts, Edit links — Task 6
- [x] Settings tiles: Brand, Languages, SEO, Custom domain, Share (with QR + copy dialog) — Task 7+8
- [x] V1 StoreBuilderEditor no longer mounted at `/store` — Task 1
- [x] V1 component files NOT deleted — Task 1 note
- [x] `emptyStoreConfigV2()` used for null `store_config_v2` in health check — Task 5
- [x] `formatIQD` from `@scheniders/shared` — Task 4
- [x] `useStorefrontUrl` used for iframe + Visit store + Share — Tasks 3, 2, 8
- [x] `useStoreAnalytics` for KPIs — Task 4, 9
- [x] Tenant query extended to include `status, store_config_v2, store_config_v2_draft` — Task 1
- [x] IQD currency, no tax — Task 4
- [x] LTR only, no dir attribute — all tasks
- [x] `"use client"` on all components — all tasks
- [x] No `any`, no `@ts-ignore` — all tasks
- [x] Glass-card design language matches platform — all card components
- [x] QR code via `qrcode` package (already installed) — Task 7
- [x] type-check + lint verification — Task 11
- [x] git commit — Task 12

**Type consistency check:**
- `Tenant` interface defined in `command-center.tsx` and the same shape is accepted from `page.tsx` — matches.
- `StoreConfigV2` imported from `@scheniders/shared` everywhere — consistent.
- `StoreAnalytics` from `@/hooks/use-store-analytics` used directly; the hook exports the type.
- `emptyStoreConfigV2` called as a function `emptyStoreConfigV2()` — matches its signature in `store-config-v2-resolver.ts`.
- `runHealthChecks` returns `HealthReport` with `{ score, checks, category_scores }` — `health-card.tsx` destructures `score` and `checks` — matches.
- `PageId` used as key in `PAGE_LABELS` record — matches union from `store-config-v2.ts`.
