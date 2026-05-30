"use client";

import { motion } from "framer-motion";

type AnimatedIconProps = {
    className?: string;
    active?: boolean;
};

const baseSvgProps = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
};

/* ─── spring presets ─── */
const snappy = { type: "spring" as const, stiffness: 480, damping: 22, mass: 0.7 };
const bouncy = { type: "spring" as const, stiffness: 380, damping: 20, mass: 0.8 };
const firm   = { type: "spring" as const, stiffness: 520, damping: 24, mass: 0.7 };

/**
 * Dashboard — four cards scatter in rotated, then spring-snap into grid.
 */
export function AnimatedDashboardIcon({ className, active }: AnimatedIconProps) {
    const rects = [
        { w: 7, h: 9, x: 3, y: 3, fromRotate: -28, fromX: -6, fromY: -6 },
        { w: 7, h: 5, x: 14, y: 3, fromRotate: 32, fromX: 8, fromY: -8 },
        { w: 7, h: 9, x: 14, y: 12, fromRotate: -24, fromX: 8, fromY: 8 },
        { w: 7, h: 5, x: 3, y: 16, fromRotate: 22, fromX: -8, fromY: 6 },
    ];

    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {rects.map((r, i) => (
                <motion.rect
                    key={i}
                    width={r.w}
                    height={r.h}
                    x={r.x}
                    y={r.y}
                    rx={1}
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    initial={
                        active
                            ? { scale: 0, rotate: r.fromRotate, x: r.fromX, y: r.fromY, opacity: 0 }
                            : false
                    }
                    animate={{ scale: 1, rotate: 0, x: 0, y: 0, opacity: 1 }}
                    transition={{ ...bouncy, delay: i * 0.07 }}
                />
            ))}
        </svg>
    );
}

/**
 * Orders — whole package springs in, lid drops shut.
 */
export function AnimatedOrdersIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            <motion.g
                style={{ transformOrigin: "12px 12px" }}
                initial={active ? { scale: 0.5, rotate: -12 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={firm}
            >
                <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
                <path d="M12 22V12" />
                <path d="m7.5 4.27 9 5.15" />
                <motion.polyline
                    points="3.29 7 12 12 20.71 7"
                    initial={active ? { y: -5 } : false}
                    animate={{ y: 0 }}
                    transition={{ type: "spring", stiffness: 620, damping: 20, mass: 0.6, delay: 0.15 }}
                />
            </motion.g>
        </svg>
    );
}

/**
 * Customers — left person slides in from left, right person from right.
 */
export function AnimatedCustomersIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Left person */}
            <motion.g
                initial={active ? { x: -8, opacity: 0 } : false}
                animate={{ x: 0, opacity: 1 }}
                transition={{ ...snappy, delay: 0 }}
            >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
            </motion.g>
            {/* Right person peeks in */}
            <motion.g
                initial={active ? { x: 8, opacity: 0 } : false}
                animate={{ x: 0, opacity: 1 }}
                transition={{ ...snappy, delay: 0.1 }}
            >
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </motion.g>
        </svg>
    );
}

/**
 * Products (ShoppingBag) — bag drops in from above, handle arcs spring up.
 */
export function AnimatedProductsIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Bag body drops in */}
            <motion.g
                style={{ transformOrigin: "12px 14px" }}
                initial={active ? { y: -10, scale: 0.7, opacity: 0 } : false}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={firm}
            >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
            </motion.g>
            {/* Handle arc springs up with slight delay */}
            <motion.path
                d="M16 10a4 4 0 0 1-8 0"
                initial={active ? { y: 4, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...bouncy, delay: 0.12 }}
            />
        </svg>
    );
}

/**
 * Analytics (BarChart3) — bars grow upward from the baseline with stagger.
 */
export function AnimatedAnalyticsIcon({ className, active }: AnimatedIconProps) {
    // Bars: short, tall, medium — staggered from left to right
    const bars = [
        { d: "M8 17v-3", delay: 0.16 },
        { d: "M13 17V5", delay: 0.08 },
        { d: "M18 17V9", delay: 0 },
    ];

    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Axis — appears first */}
            <motion.path
                d="M3 3v16a2 2 0 0 0 2 2h16"
                initial={active ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Bars spring up */}
            {bars.map((bar, i) => (
                <motion.path
                    key={i}
                    d={bar.d}
                    style={{ transformOrigin: "center bottom" }}
                    initial={active ? { scaleY: 0, opacity: 0 } : false}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ ...snappy, delay: bar.delay }}
                />
            ))}
        </svg>
    );
}

/**
 * Reports (FileBarChart) — document flips in, chart bars rise inside.
 */
export function AnimatedReportsIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Document body */}
            <motion.g
                style={{ transformOrigin: "10px 12px" }}
                initial={active ? { scale: 0.5, rotate: 12, opacity: 0 } : false}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={firm}
            >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </motion.g>
            {/* Inner chart bars grow up with stagger */}
            {[
                { d: "M8 18v-2", delay: 0.14 },
                { d: "M12 18v-4", delay: 0.2 },
                { d: "M16 18v-6", delay: 0.26 },
            ].map((bar, i) => (
                <motion.path
                    key={i}
                    d={bar.d}
                    style={{ transformOrigin: "center bottom" }}
                    initial={active ? { scaleY: 0, opacity: 0 } : false}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ ...snappy, delay: bar.delay }}
                />
            ))}
        </svg>
    );
}

/**
 * Printing — printer body appears, paper sheet slides out from bottom.
 */
export function AnimatedPrintingIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Printer body + top paper input */}
            <motion.g
                style={{ transformOrigin: "12px 10px" }}
                initial={active ? { scale: 0.6, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={firm}
            >
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
            </motion.g>
            {/* Output paper slides down */}
            <motion.rect
                x="6" y="14" width="12" height="8" rx="1"
                initial={active ? { y: -6, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...bouncy, delay: 0.15 }}
            />
        </svg>
    );
}

/**
 * Team (UsersRound) — circle group assembles, people pop in sequentially.
 */
export function AnimatedTeamIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Main person + arc */}
            <motion.g
                initial={active ? { y: 6, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...snappy, delay: 0 }}
            >
                <path d="M18 21a8 8 0 0 0-16 0" />
                <circle cx="10" cy="8" r="5" />
            </motion.g>
            {/* Second person slides in from right */}
            <motion.path
                d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"
                initial={active ? { x: 6, opacity: 0 } : false}
                animate={{ x: 0, opacity: 1 }}
                transition={{ ...snappy, delay: 0.1 }}
            />
        </svg>
    );
}

/**
 * Vault (Database) — disc layers stack down one by one from the top.
 */
export function AnimatedVaultIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Top ellipse — first to land */}
            <motion.ellipse
                cx="12" cy="5" rx="9" ry="3"
                initial={active ? { y: -6, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...firm, delay: 0 }}
            />
            {/* Middle ring */}
            <motion.path
                d="M3 12A9 3 0 0 0 21 12"
                initial={active ? { y: -4, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...firm, delay: 0.08 }}
            />
            {/* Cylinder body — last */}
            <motion.path
                d="M3 5V19A9 3 0 0 0 21 19V5"
                initial={active ? { y: -2, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...firm, delay: 0.14 }}
            />
        </svg>
    );
}

/**
 * Store — building rises up, scalloped awning unfolds from the top.
 */
export function AnimatedStoreIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Roof line + awning scallops */}
            <motion.g
                initial={active ? { y: -8, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...firm, delay: 0 }}
            >
                <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                <path d="M2 7h20" />
                <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
            </motion.g>
            {/* Building body rises up */}
            <motion.g
                initial={active ? { y: 8, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...bouncy, delay: 0.1 }}
            >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
            </motion.g>
        </svg>
    );
}

/**
 * Finances — coin flips in, trend arrow sketches upward.
 */
export function AnimatedFinancesIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Coin — flips in on Y-axis, scales up */}
            <motion.circle
                cx="9" cy="15" r="5"
                style={{ transformOrigin: "9px 15px" }}
                initial={active ? { scale: 0.2, opacity: 0, rotateY: -120 } : false}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                transition={{ ...bouncy, delay: 0 }}
            />
            {/* Dollar stroke */}
            <motion.path
                d="M9 12v6M7 14h3a1 1 0 0 1 0 2H8a1 1 0 0 0 0 2h3"
                initial={active ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Upward trend line */}
            <motion.path
                d="M14 9 L18 5 L22 9"
                initial={active ? { pathLength: 0, opacity: 0, y: 4 } : false}
                animate={{ pathLength: 1, opacity: 1, y: 0 }}
                transition={{ ...firm, delay: 0.25 }}
            />
            <motion.path
                d="M18 5 L18 11"
                initial={active ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.35, ease: "easeOut" }}
            />
        </svg>
    );
}

/**
 * Settings — gear spins one full turn while scaling in, inner circle pops.
 */
export function AnimatedSettingsIcon({ className, active }: AnimatedIconProps) {
    return (
        <svg key={active ? "on" : "off"} {...baseSvgProps} className={className}>
            {/* Gear body — rotates in */}
            <motion.path
                d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                style={{ transformOrigin: "12px 12px" }}
                initial={active ? { rotate: -180, scale: 0.4, opacity: 0 } : false}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 16, mass: 0.8 }}
            />
            {/* Inner circle — pops in after gear lands */}
            <motion.circle
                cx="12" cy="12" r="3"
                style={{ transformOrigin: "12px 12px" }}
                initial={active ? { scale: 0, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...snappy, delay: 0.18 }}
            />
        </svg>
    );
}

