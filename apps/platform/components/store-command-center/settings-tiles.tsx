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
        <div className="glass-card rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-muted/20 transition-colors cursor-pointer group h-full">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
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
