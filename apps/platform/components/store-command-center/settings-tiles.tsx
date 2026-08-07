"use client";

import { useState } from "react";
import Link from "next/link";
import { Palette, Globe2, Search, LinkIcon, Share2 } from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { STRINGS, t } from "@/lib/editor-i18n";
import { ShareDialog } from "./share-dialog";
import { DomainDialog } from "./domain-dialog";

interface SettingsTilesProps {
    storefrontUrl: string;
    businessName: string;
    tenantId: string;
    slug: string;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
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
        <div className="flex h-full cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-(--card-bg) p-4 shadow-(--card-shadow) transition-all duration-150 group hover:-translate-y-0.5 hover:border-(--border-hover) hover:shadow-(--card-shadow-hover)">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                {icon}
            </div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
        </div>
    );

    if (href) {
        return <Link href={href} className="block">{inner}</Link>;
    }
    return (
        <button onClick={onClick} className="text-left block w-full">
            {inner}
        </button>
    );
}

export function SettingsTiles({ storefrontUrl, businessName, tenantId, slug, locale }: SettingsTilesProps) {
    const [shareOpen, setShareOpen] = useState(false);
    const [domainOpen, setDomainOpen] = useState(false);

    return (
        <>
            <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
                <h3 className="text-base font-semibold text-foreground mb-4">
                    {t(STRINGS.command_center.quick_settings, locale)}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Tile
                        href="/store/edit?screen=brand_kit"
                        icon={<Palette className="w-4 h-4" />}
                        label={t(STRINGS.command_center.tile_brand_label, locale)}
                        description={t(STRINGS.command_center.tile_brand_desc, locale)}
                    />
                    <Tile
                        href="/store/edit?screen=i18n"
                        icon={<Globe2 className="w-4 h-4" />}
                        label={t(STRINGS.command_center.tile_languages_label, locale)}
                        description={t(STRINGS.command_center.tile_languages_desc, locale)}
                    />
                    <Tile
                        href="/store/edit?page=home&tab=seo"
                        icon={<Search className="w-4 h-4" />}
                        label={t(STRINGS.command_center.tile_seo_label, locale)}
                        description={t(STRINGS.command_center.tile_seo_desc, locale)}
                    />
                    <Tile
                        onClick={() => setDomainOpen(true)}
                        icon={<LinkIcon className="w-4 h-4" />}
                        label={t(STRINGS.command_center.tile_domain_label, locale)}
                        description={t(STRINGS.command_center.tile_domain_desc, locale)}
                    />
                    <Tile
                        onClick={() => setShareOpen(true)}
                        icon={<Share2 className="w-4 h-4" />}
                        label={t(STRINGS.command_center.tile_share_label, locale)}
                        description={t(STRINGS.command_center.tile_share_desc, locale)}
                    />
                </div>
            </div>

            {shareOpen && (
                <ShareDialog
                    url={storefrontUrl}
                    businessName={businessName}
                    onClose={() => setShareOpen(false)}
                    locale={locale}
                />
            )}

            {domainOpen && (
                <DomainDialog
                    tenantId={tenantId}
                    slug={slug}
                    onClose={() => setDomainOpen(false)}
                    locale={locale}
                />
            )}
        </>
    );
}
