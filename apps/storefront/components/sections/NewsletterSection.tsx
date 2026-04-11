"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface NewsletterSectionProps {
  data: Record<string, unknown>;
  tenantId: string;
}

export default function NewsletterSection({ data, tenantId }: NewsletterSectionProps) {
  const title = (data.title as string) || "اشترك في نشرتنا البريدية";
  const description = (data.description as string) || "";
  const buttonText = (data.button_text as string) || "اشتراك";
  const placeholderText = (data.placeholder_text as string) || "بريدك الإلكتروني";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error } = await supabase
        .from("newsletter_subscribers")
        .insert({ tenant_id: tenantId, email: email.trim() });

      if (error && error.code === "23505") {
        // Already subscribed
        setStatus("success");
      } else if (error) {
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="py-16 bg-[var(--brand-primary)] text-white">
      <div className="max-w-2xl mx-auto px-4 text-center">
        <h2 className="text-2xl font-bold mb-3">{title}</h2>
        {description && (
          <p className="opacity-90 mb-6">{description}</p>
        )}

        {status === "success" ? (
          <p className="text-lg font-medium opacity-90">
            شكراً لاشتراكك! ✓
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto" dir="ltr">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholderText}
              required
              className="flex-1 px-4 py-3 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-white/50"
              dir="auto"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="px-6 py-3 bg-white text-[var(--brand-primary)] rounded-lg font-bold hover:opacity-90 transition disabled:opacity-50"
            >
              {status === "loading" ? "..." : buttonText}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-3 text-sm opacity-80">
            حدث خطأ، حاول مرة أخرى
          </p>
        )}
      </div>
    </section>
  );
}
