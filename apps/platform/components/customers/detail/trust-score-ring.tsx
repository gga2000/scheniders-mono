"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { TRUST_TIER_CONFIG, type TrustTier } from "@/types/customer";
import { useLanguage } from "@/hooks/use-language";

interface TrustScoreRingProps {
    score: number;
    tier: TrustTier;
    size?: number;
}

export function TrustScoreRing({ score, tier, size = 120 }: TrustScoreRingProps) {
    const { t } = useLanguage();
    const config = TRUST_TIER_CONFIG[tier];
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const center = size / 2;

    const [displayScore, setDisplayScore] = useState(0);

    useEffect(() => {
        const duration = 1200;
        const start = Date.now();
        const animate = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayScore(Math.round(eased * score));
            if (progress < 1) requestAnimationFrame(animate);
        };
        animate();
    }, [score]);

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/15" />
                    <motion.circle
                        cx={center} cy={center} r={radius}
                        fill="none" stroke={config.ringColor} strokeWidth={6} strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference - progress }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        transform={`rotate(-90 ${center} ${center})`}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Shield className="w-5 h-5 mb-1" style={{ color: config.ringColor }} />
                    <span className="text-3xl font-bold tabular-nums" style={{ color: config.ringColor }}>
                        {displayScore}
                    </span>
                </div>
            </div>
            <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${config.bgClass} ${config.textClass}`}>
                {t(config.labelKey)}
            </span>
        </div>
    );
}
