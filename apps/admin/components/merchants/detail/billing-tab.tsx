"use client";

import { CircleDollarSign, CreditCard } from "lucide-react";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const txTypeBadge: Record<string, string> = {
  topup: "bg-green-100 text-green-800",
  charge: "bg-amber-100 text-amber-800",
  refund: "bg-blue-100 text-blue-800",
  adjustment: "bg-purple-100 text-purple-800",
};

interface BillingTabProps {
  wallet: MerchantDetail["wallet"];
  transactions: MerchantDetail["transactions"];
}

export function BillingTab({ wallet, transactions }: BillingTabProps) {
  return (
    <div className="space-y-5">
      {wallet && (
        <div className="pastel-card p-5 md:p-6">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CircleDollarSign className="w-4 h-4" />
            Wallet Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-foreground/50">Balance</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.balance_iqd)} IQD</p>
            </div>
            <div>
              <span className="text-xs text-foreground/50">Threshold</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.threshold_iqd)} IQD</p>
            </div>
            <div>
              <span className="text-xs text-foreground/50">Total Charged</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.total_charged_iqd)} IQD</p>
            </div>
            <div>
              <span className="text-xs text-foreground/50">Total Topped Up</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.total_topped_up_iqd)} IQD</p>
            </div>
          </div>
        </div>
      )}

      <div className="pastel-card overflow-hidden">
        <div className="p-5 md:p-6 border-b border-[var(--card-border)]">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Transaction History
          </h2>
        </div>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
            <CreditCard className="w-8 h-8 mb-2" />
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">Date</th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">Type</th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">Amount</th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">Balance After</th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors">
                    <td className="p-3 text-foreground/70">{new Date(tx.created_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${txTypeBadge[tx.type] ?? "bg-gray-100 text-gray-600"}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{fmt(tx.amount_iqd)} IQD</td>
                    <td className="p-3 text-right text-foreground/70">{fmt(tx.balance_after_iqd)} IQD</td>
                    <td className="p-3 text-foreground/70">{tx.description || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
