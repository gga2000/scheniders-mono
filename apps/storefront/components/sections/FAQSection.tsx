"use client";

import { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

interface FAQSectionProps {
  data: Record<string, unknown>;
}

function AccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-zinc-200 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 text-right"
      >
        <span className="font-medium text-zinc-900">{item.question}</span>
        <svg
          className={`w-5 h-5 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="pb-4 text-zinc-600 leading-relaxed whitespace-pre-line">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export default function FAQSection({ data }: FAQSectionProps) {
  const items = (data.items as FaqItem[]) || [];
  const visibleItems = items.filter((item) => item.question && item.answer);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (visibleItems.length === 0) return null;

  return (
    <section className="py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold mb-8 text-center text-zinc-900">
          الأسئلة الشائعة
        </h2>
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 px-6 divide-y divide-zinc-200">
          {visibleItems.map((item, index) => (
            <AccordionItem
              key={index}
              item={item}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
