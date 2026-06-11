"use client";

import { useState } from "react";
import Link from "next/link";
import { Palette, Globe2, Search, LinkIcon, Share2 } from "lucide-react";
import { ShareDialog } from "./share-dialog";
import { DomainDialog } from "./domain-dialog";

interface SettingsTilesProps {
    storefrontUrl: string;
    businessName: string;
    tenantId: string;
    slug: string;
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

export function SettingsTiles({ storefrontUrl, businessName, tenantId, slug }: SettingsTilesProps) {
    const [shareOpen, setShareOpen] = useState(false);
    const [domainOpen, setDomainOpen] = useState(false);

    return (
        <>
            <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
                <h3 className="text-base font-semibold text-foreground mb-4">Quick settings</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Tile
                        href="/store/edit?screen=brand_kit"
                        icon={<Palette className="w-4 h-4" />}
                        label="Brand & theme"
                        description="Logo, colors, fonts, shapes"
                    />
                    <Tile
                        href="/store/edit?screen=i18n"
                        icon={<Globe2 className="w-4 h-4" />}
                        label="Languages"
                        description="Arabic, English, Kurdish"
                    />
                    <Tile
                        href="/store/edit?screen=brand_kit"
                        icon={<Search className="w-4 h-4" />}
                        label="SEO"
                        description="Page titles & meta descriptions"
                    />
                    <Tile
                        onClick={() => setDomainOpen(true)}
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

            {domainOpen && (
                <DomainDialog
                    tenantId={tenantId}
                    slug={slug}
                    onClose={() => setDomainOpen(false)}
                />
            )}
        </>
    );
}
