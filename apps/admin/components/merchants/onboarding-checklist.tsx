"use client";

import {
  ShoppingBag,
  Users,
  Palette,
  Globe,
  Wallet,
  Link2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  completed: boolean;
  description: string;
}

interface OnboardingChecklistProps {
  tenant: {
    id: string;
    business_name: string;
    branding?: {
      logo_url: string | null;
      primary_color: string;
    } | null;
  };
  orderCount: number;
  teamCount: number;
  walletBalance: number;
  hasStorefront: boolean;
  hasCustomDomain: boolean;
}

export function OnboardingChecklist({
  tenant,
  orderCount,
  teamCount,
  walletBalance,
  hasStorefront,
  hasCustomDomain,
}: OnboardingChecklistProps) {
  const steps: OnboardingStep[] = [
    {
      id: "orders",
      label: "First Order Created",
      icon: <ShoppingBag className="w-4 h-4" />,
      completed: orderCount > 0,
      description: orderCount > 0 ? `${orderCount} orders total` : "No orders yet",
    },
    {
      id: "team",
      label: "Team Member Invited",
      icon: <Users className="w-4 h-4" />,
      completed: teamCount > 1,
      description: teamCount > 1 ? `${teamCount} members` : "Only owner",
    },
    {
      id: "branding",
      label: "Branding Configured",
      icon: <Palette className="w-4 h-4" />,
      completed: !!(tenant.branding?.logo_url && tenant.branding.primary_color !== "#1E1E1E"),
      description: tenant.branding?.logo_url ? "Logo & colors set" : "No logo uploaded",
    },
    {
      id: "storefront",
      label: "Storefront Published",
      icon: <Globe className="w-4 h-4" />,
      completed: hasStorefront,
      description: hasStorefront ? "Live" : "Not published",
    },
    {
      id: "wallet",
      label: "Wallet Funded",
      icon: <Wallet className="w-4 h-4" />,
      completed: walletBalance > 0,
      description: walletBalance > 0
        ? `${new Intl.NumberFormat("en-IQ").format(walletBalance)} IQD`
        : "Zero balance",
    },
    {
      id: "domain",
      label: "Custom Domain Set Up",
      icon: <Link2 className="w-4 h-4" />,
      completed: hasCustomDomain,
      description: hasCustomDomain ? "Connected" : "Using default subdomain",
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const percentage = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="pastel-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Onboarding Progress
        </h2>
        <span className={cn(
          "text-sm font-bold",
          percentage === 100 ? "text-green-600" : percentage >= 50 ? "text-amber-600" : "text-red-600",
        )}>
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-foreground/5 mb-5 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            percentage === 100 ? "bg-green-500" : percentage >= 50 ? "bg-amber-500" : "bg-red-500",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border transition-colors",
              step.completed
                ? "border-green-200 bg-green-50/50 dark:border-green-400/20 dark:bg-green-400/5"
                : "border-[var(--card-border)] bg-foreground/[0.01]",
            )}
          >
            {/* Status icon */}
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                step.completed
                  ? "bg-green-100 text-green-600 dark:bg-green-400/15 dark:text-green-400"
                  : "bg-foreground/5 text-foreground/30",
              )}
            >
              {step.completed ? <Check className="w-4 h-4" /> : step.icon}
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-semibold",
                step.completed ? "text-foreground" : "text-foreground/60",
              )}>
                {step.label}
              </p>
              <p className="text-[11px] text-foreground/40">{step.description}</p>
            </div>

            {/* Check/X indicator */}
            {step.completed ? (
              <Check className="w-4 h-4 text-green-500 shrink-0" />
            ) : (
              <X className="w-4 h-4 text-foreground/20 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
