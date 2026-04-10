"use client";

import { useState, useRef, useEffect } from "react";
import {
    Star, Shield, Zap, Clock, Heart, Award, CheckCircle, Package, Truck,
    Globe, Lock, Sparkles, ThumbsUp, Flame, Target, Leaf, Sun, Moon, Cloud,
    Droplets, Wind, Battery, Wifi, Settings, Users, Camera, Music, Video,
    Headphones, Monitor, Smartphone, Tablet, Watch, Cpu, Database, Server,
    Code, FileText, BookOpen, GraduationCap, Briefcase, Building, Home, Map,
    Navigation, Compass, Flag, Gift, Crown, Diamond, Gem, Palette, Brush,
    Scissors, Wrench, Hammer,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
    Star,
    Shield,
    Zap,
    Clock,
    Heart,
    Award,
    CheckCircle,
    Package,
    Truck,
    Globe,
    Lock,
    Sparkles,
    ThumbsUp,
    Flame,
    Target,
    Leaf,
    Sun,
    Moon,
    Cloud,
    Droplets,
    Wind,
    Battery,
    Wifi,
    Settings,
    Users,
    Camera,
    Music,
    Video,
    Headphones,
    Monitor,
    Smartphone,
    Tablet,
    Watch,
    Cpu,
    Database,
    Server,
    Code,
    FileText,
    BookOpen,
    GraduationCap,
    Briefcase,
    Building,
    Home,
    Map,
    Navigation,
    Compass,
    Flag,
    Gift,
    Crown,
    Diamond,
    Gem,
    Palette,
    Brush,
    Scissors,
    Wrench,
    Hammer,
};

const ICON_NAMES = Object.keys(ICON_MAP);

export function renderIcon(name: string, className?: string) {
    const IconComponent = ICON_MAP[name] || Star;
    return <IconComponent className={className} />;
}

interface IconPickerProps {
    value: string;
    onChange: (iconName: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const filtered = ICON_NAMES.filter((name) =>
        name.toLowerCase().includes(search.toLowerCase())
    );

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div className="relative" ref={containerRef}>
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => {
                    setOpen(!open);
                    setSearch("");
                }}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground hover:border-[var(--ink)]/30 transition-colors cursor-pointer"
            >
                {renderIcon(value, "w-4 h-4")}
                <span>{value || "Star"}</span>
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute z-20 left-0 top-full mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg p-3 w-72">
                    {/* Search input */}
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search icons..."
                        autoFocus
                        className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] mb-2"
                    />

                    {/* Icon grid */}
                    <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
                        {filtered.map((name) => (
                            <button
                                key={name}
                                type="button"
                                title={name}
                                onClick={() => {
                                    onChange(name);
                                    setOpen(false);
                                }}
                                className={`p-2 rounded-lg hover:bg-[var(--pastel-blue)] cursor-pointer transition-colors flex items-center justify-center ${
                                    value === name ? "bg-[var(--pastel-blue)]" : ""
                                }`}
                            >
                                {renderIcon(name, "w-4 h-4")}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="col-span-6 text-sm text-muted text-center py-4">
                                No icons found
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
