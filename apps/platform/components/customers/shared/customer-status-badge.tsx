"use client";

import { Star, User, Sparkles, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerStatus } from "@/types/customer";
import { useLanguage } from "@/hooks/use-language";

const STATUS_CONFIG: Record<string, {
  key: string;
  icon: React.ElementType;
  className: string;
}> = {
  vip: {
    key: "customers.status.vip",
    icon: Star,
    className: "bg-amber-50 text-amber-700 border-amber-200 [&_svg]:fill-amber-400 [&_svg]:text-amber-500",
  },
  regular: {
    key: "customers.status.regular",
    icon: User,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  new: {
    key: "customers.status.new",
    icon: Sparkles,
    className: "bg-teal-50 text-teal-700 border-teal-200",
  },
  blacklisted: {
    key: "customers.status.blacklisted",
    icon: Ban,
    className: "bg-red-50 text-red-600 border-red-200",
  },
};

interface CustomerStatusBadgeProps {
  status: CustomerStatus | "blacklisted";
  size?: "sm" | "md";
  className?: string;
}

export function CustomerStatusBadge({
  status,
  size = "sm",
  className,
}: CustomerStatusBadgeProps) {
  const { t } = useLanguage();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        config.className,
        className
      )}
    >
      <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      {t(config.key)}
    </span>
  );
}

