"use client";

import { useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Wallet,
  Clock,
  Copy,
  Globe,
} from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";

interface ContextMenuItem {
  label: string;
  icon: ReactNode;
  action: () => void;
  variant?: "default" | "destructive";
}

interface ContextMenuProps {
  merchantId: string;
  merchantSlug: string;
  children: ReactNode;
}

export function MerchantContextMenu({
  merchantId,
  merchantSlug,
  children,
}: ContextMenuProps) {
  const router = useRouter();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: ContextMenuItem[] = [
    {
      label: "View Details",
      icon: <ExternalLink className="w-3.5 h-3.5" />,
      action: () => router.push(`/merchants/${merchantId}`),
    },
    {
      label: "Top Up Wallet",
      icon: <Wallet className="w-3.5 h-3.5" />,
      action: () => router.push(`/billing?topup=${merchantId}`),
    },
    {
      label: "Extend Trial",
      icon: <Clock className="w-3.5 h-3.5" />,
      action: () => router.push(`/merchants/${merchantId}?action=extend-trial`),
    },
    {
      label: "Copy Slug",
      icon: <Copy className="w-3.5 h-3.5" />,
      action: () => {
        navigator.clipboard.writeText(merchantSlug);
      },
    },
    {
      label: "Open Storefront",
      icon: <Globe className="w-3.5 h-3.5" />,
      action: () => window.open(`https://${merchantSlug}.scheniders.com`, "_blank"),
    },
  ];

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleClose = useCallback(() => {
    setPosition(null);
  }, []);

  useEffect(() => {
    if (!position) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [position, handleClose]);

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>

      <AnimatePresence>
        {position && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: EASE_CHROME }}
            className="fixed z-[100] min-w-[180px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl py-1.5 overflow-hidden"
            style={{ left: position.x, top: position.y }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.action();
                  handleClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground/80 hover:bg-foreground/5 hover:text-foreground transition-colors"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
