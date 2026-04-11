"use client";

import { useState } from "react";

interface PoliciesSectionProps {
  data: Record<string, unknown>;
}

const TABS = [
  { key: "shipping", label: "سياسة الشحن" },
  { key: "returns", label: "سياسة الإرجاع" },
  { key: "privacy", label: "سياسة الخصوصية" },
] as const;

export default function PoliciesSection({ data }: PoliciesSectionProps) {
  const shipping = (data.shipping as string) || "";
  const returns = (data.returns as string) || "";
  const privacy = (data.privacy as string) || "";

  const availableTabs = TABS.filter(({ key }) => {
    const content = key === "shipping" ? shipping : key === "returns" ? returns : privacy;
    return content.trim().length > 0;
  });

  const [activeTab, setActiveTab] = useState(availableTabs[0]?.key || "shipping");

  if (availableTabs.length === 0) return null;

  const activeContent =
    activeTab === "shipping" ? shipping : activeTab === "returns" ? returns : privacy;

  return (
    <section className="py-16 bg-zinc-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold mb-8 text-center text-zinc-900">
          السياسات
        </h2>

        {/* Tab bar */}
        <div className="flex gap-2 mb-6 justify-center">
          {availableTabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === key
                  ? "bg-[var(--brand-primary)] text-white"
                  : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <div className="prose prose-zinc max-w-none whitespace-pre-line">
            {activeContent}
          </div>
        </div>
      </div>
    </section>
  );
}
