"use client";

import {
  Building2,
  DollarSign,
  Clock,
  AlertTriangle,
  Wallet,
  TrendingUp,
} from "lucide-react";

interface KpiGridProps {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  totalWalletBalance: number;
  totalToppedUpThisMonth: number;
  totalChargedThisMonth: number;
  isLoading?: boolean;
}

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

function SkeletonValue() {
  return (
    <div className="h-10 md:h-14 w-24 md:w-32 rounded-lg bg-white/40 animate-pulse" />
  );
}

function SkeletonSubtitle() {
  return (
    <div className="h-4 md:h-5 w-20 md:w-28 rounded bg-white/30 animate-pulse" />
  );
}

export function KpiGrid({
  totalTenants,
  activeTenants,
  trialTenants,
  suspendedTenants,
  totalWalletBalance,
  totalToppedUpThisMonth,
  totalChargedThisMonth,
  isLoading,
}: KpiGridProps) {
  const conversionRate =
    activeTenants + trialTenants > 0
      ? Math.round((activeTenants / (activeTenants + trialTenants)) * 100)
      : 0;

  return (
    <div className="grid gap-3 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {/* Card 1: Total Tenants - Blue */}
      <div className="pastel-card pastel-card-blue p-4 md:p-6 group relative overflow-hidden">
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <Building2 className="h-5 w-5 md:h-6 md:w-6 text-blue-700" />
          </div>
          <span className="px-2.5 md:px-3 py-1 rounded-full bg-blue-600/20 text-blue-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
            Platform
          </span>
        </div>

        <div className="space-y-1 md:space-y-2">
          <h3 className="text-xs md:text-sm font-semibold text-blue-900/70 uppercase tracking-wider">
            Total Tenants
          </h3>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <p className="text-3xl md:text-5xl font-bold text-blue-950 tracking-tight">
              {totalTenants}
            </p>
          )}
          {isLoading ? (
            <SkeletonSubtitle />
          ) : (
            <p className="text-xs md:text-sm text-blue-800/70 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-600 animate-pulse-soft" />
              {activeTenants} active
            </p>
          )}
        </div>

        <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
          <Building2 className="h-24 w-24 text-blue-900" />
        </div>
      </div>

      {/* Card 2: Monthly Revenue - Green */}
      <div className="pastel-card pastel-card-green p-4 md:p-6 group relative overflow-hidden">
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-green-700" />
          </div>
          <span className="px-2.5 md:px-3 py-1 rounded-full bg-green-600/20 text-green-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
            Revenue
          </span>
        </div>

        <div className="space-y-1 md:space-y-2">
          <h3 className="text-xs md:text-sm font-semibold text-green-900/70 uppercase tracking-wider">
            Monthly Revenue
          </h3>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <p className="text-3xl md:text-5xl font-bold text-green-950 tracking-tight">
              {formatIQD(totalToppedUpThisMonth)}
            </p>
          )}
          {isLoading ? (
            <SkeletonSubtitle />
          ) : (
            <p className="text-xs md:text-sm text-green-800/70 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-600" />
              {formatIQD(totalChargedThisMonth)} charged
            </p>
          )}
        </div>

        <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
          <DollarSign className="h-24 w-24 text-green-900" />
        </div>
      </div>

      {/* Card 3: Active Trials - Yellow */}
      <div className="pastel-card pastel-card-yellow p-4 md:p-6 group relative overflow-hidden">
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <Clock className="h-5 w-5 md:h-6 md:w-6 text-amber-700" />
          </div>
          <span className="px-2.5 md:px-3 py-1 rounded-full bg-amber-600/20 text-amber-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
            Trials
          </span>
        </div>

        <div className="space-y-1 md:space-y-2">
          <h3 className="text-xs md:text-sm font-semibold text-amber-900/70 uppercase tracking-wider">
            Active Trials
          </h3>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <p className="text-3xl md:text-5xl font-bold text-amber-950 tracking-tight">
              {trialTenants}
            </p>
          )}
          {isLoading ? (
            <SkeletonSubtitle />
          ) : (
            <p className="text-xs md:text-sm text-amber-800/70 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-amber-600 animate-pulse-soft" />
              converting soon
            </p>
          )}
        </div>

        <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
          <Clock className="h-24 w-24 text-amber-900" />
        </div>
      </div>

      {/* Card 4: At Risk - Pink */}
      <div className="pastel-card pastel-card-pink p-4 md:p-6 group relative overflow-hidden">
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-rose-700" />
          </div>
          <span className="px-2.5 md:px-3 py-1 rounded-full bg-rose-600/20 text-rose-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
            Alert
          </span>
        </div>

        <div className="space-y-1 md:space-y-2">
          <h3 className="text-xs md:text-sm font-semibold text-rose-900/70 uppercase tracking-wider">
            At Risk
          </h3>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <p className="text-3xl md:text-5xl font-bold text-rose-950 tracking-tight">
              {suspendedTenants}
            </p>
          )}
          {isLoading ? (
            <SkeletonSubtitle />
          ) : (
            <p className="text-xs md:text-sm text-rose-800/70 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-rose-600 animate-pulse-soft" />
              need attention
            </p>
          )}
        </div>

        <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
          <AlertTriangle className="h-24 w-24 text-rose-900" />
        </div>
      </div>

      {/* Card 5: Wallet Balance - Purple */}
      <div className="pastel-card pastel-card-purple p-4 md:p-6 group relative overflow-hidden">
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <Wallet className="h-5 w-5 md:h-6 md:w-6 text-purple-700" />
          </div>
          <span className="px-2.5 md:px-3 py-1 rounded-full bg-purple-600/20 text-purple-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
            Wallets
          </span>
        </div>

        <div className="space-y-1 md:space-y-2">
          <h3 className="text-xs md:text-sm font-semibold text-purple-900/70 uppercase tracking-wider">
            Wallet Balance
          </h3>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <p className="text-3xl md:text-5xl font-bold text-purple-950 tracking-tight">
              {formatIQD(totalWalletBalance)}
            </p>
          )}
          {isLoading ? (
            <SkeletonSubtitle />
          ) : (
            <p className="text-xs md:text-sm text-purple-800/70 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-purple-600" />
              across all tenants
            </p>
          )}
        </div>

        <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
          <Wallet className="h-24 w-24 text-purple-900" />
        </div>
      </div>

      {/* Card 6: Trial Conversion - Mint */}
      <div className="pastel-card pastel-card-mint p-4 md:p-6 group relative overflow-hidden">
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-teal-700" />
          </div>
          <span className="px-2.5 md:px-3 py-1 rounded-full bg-teal-600/20 text-teal-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
            Growth
          </span>
        </div>

        <div className="space-y-1 md:space-y-2">
          <h3 className="text-xs md:text-sm font-semibold text-teal-900/70 uppercase tracking-wider">
            Trial Conversion
          </h3>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <p className="text-3xl md:text-5xl font-bold text-teal-950 tracking-tight">
              {conversionRate}%
            </p>
          )}
          {isLoading ? (
            <SkeletonSubtitle />
          ) : (
            <p className="text-xs md:text-sm text-teal-800/70 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-teal-600" />
              trial to active
            </p>
          )}
        </div>

        <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
          <TrendingUp className="h-24 w-24 text-teal-900" />
        </div>
      </div>
    </div>
  );
}
