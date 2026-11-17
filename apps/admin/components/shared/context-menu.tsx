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
import { storeAddress } from "@scheniders/shared/store-address";
import { EASE_CHROME } from "@/lib/animation-constants";
import { shopFormHref } from "@/lib/shop-actions";
import { useCan } from "@/hooks/use-admin-auth";
import type { AdminAction } from "@/types/admin";

interface ContextMenuItem {
  label: string;
  icon: ReactNode;
  action: () => void;
  variant?: "default" | "destructive";
  /** Left out for anyone whose role may not do this. */
  needs?: AdminAction;
}

interface ContextMenuProps {
  merchantId: string;
  merchantSlug: string;
  /**
   * Whether the shop can get free trial days (a shop on trial). For any other
   * shop the shop page has no days form, so the item opened the page and did
   * nothing more.
   */
  onTrial: boolean;
  children: ReactNode;
}

export function MerchantContextMenu({
  merchantId,
  merchantSlug,
  onTrial,
  children,
}: ContextMenuProps) {
  const router = useRouter();
  const can = useCan();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const allItems: ContextMenuItem[] = [
    {
      label: "View Details",
      icon: <ExternalLink className="w-3.5 h-3.5" />,
      action: () => router.push(`/merchants/${merchantId}`),
    },
    {
      label: "Top Up Wallet",
      icon: <Wallet className="w-3.5 h-3.5" />,
      action: () => router.push(shopFormHref(merchantId, "money")),
      needs: "top_up_wallet",
    },
    ...(onTrial
      ? [
          {
            label: "Give free days",
            icon: <Clock className="w-3.5 h-3.5" />,
            action: () => router.push(shopFormHref(merchantId, "days")),
            needs: "extend_trial" as const,
          },
        ]
      : []),
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
      action: () => window.open(`https://${storeAddress(merchantSlug)}`, "_blank"),
    },
  ];
  const items = allItems.filter((item) => !item.needs || can(item.needs));

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
