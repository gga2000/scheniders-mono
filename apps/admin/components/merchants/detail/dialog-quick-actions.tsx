"use client";

import { Phone, MessageCircle, Mail, ExternalLink, Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const STOREFRONT_BASE =
  process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/+$/, "") ?? "http://localhost:3001/store";

function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  // Iraqi local format: 07XXXXXXXXX → 964 7XXXXXXXXX
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `964${digits.slice(1)}`;
  if (!digits.startsWith("964") && digits.length === 10) digits = `964${digits}`;
  return digits;
}

interface QuickButtonProps {
  icon: typeof Phone;
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "green" | "blue" | "violet";
  external?: boolean;
}

function QuickButton({ icon: Icon, label, href, onClick, tone = "default", external }: QuickButtonProps) {
  const toneClass = {
    default: "text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]",
    green:
      "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-400/10",
    blue: "text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-400/10",
    violet:
      "text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-400/10",
  }[tone];

  const className = cn(
    "inline-flex items-center justify-center w-8 h-8 rounded-xl transition-colors",
    toneClass
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        title={label}
        aria-label={label}
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className="w-4 h-4" />
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={className}>
      <Icon className="w-4 h-4" />
    </button>
  );
}

interface DialogQuickActionsProps {
  contactPhone: string | null;
  contactEmail: string | null;
  slug: string;
  businessName: string;
}

export function DialogQuickActions({
  contactPhone,
  contactEmail,
  slug,
  businessName,
}: DialogQuickActionsProps) {
  const [copied, setCopied] = useState<"phone" | "email" | null>(null);
  const waNumber = toWhatsAppNumber(contactPhone);
  const storefrontUrl = `${STOREFRONT_BASE}/${slug}`;

  const handleCopy = async (kind: "phone" | "email", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-2xl bg-foreground/[0.03] dark:bg-white/[0.03] p-0.5 ring-1 ring-foreground/[0.05]">
      {contactPhone && (
        <>
          <QuickButton
            icon={Phone}
            label={`Call ${contactPhone}`}
            href={`tel:${contactPhone}`}
            tone="green"
          />
          {waNumber && (
            <QuickButton
              icon={MessageCircle}
              label={`WhatsApp ${contactPhone}`}
              href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
                `Hi ${businessName}, this is the Scheniders team — `
              )}`}
              tone="green"
              external
            />
          )}
          <QuickButton
            icon={copied === "phone" ? Check : Copy}
            label={copied === "phone" ? "Copied" : `Copy phone (${contactPhone})`}
            onClick={() => handleCopy("phone", contactPhone)}
          />
        </>
      )}
      {contactEmail && (
        <>
          <span aria-hidden className="w-px h-5 bg-foreground/10 mx-0.5" />
          <QuickButton
            icon={Mail}
            label={`Email ${contactEmail}`}
            href={`mailto:${contactEmail}`}
            tone="blue"
          />
          <QuickButton
            icon={copied === "email" ? Check : Copy}
            label={copied === "email" ? "Copied" : `Copy email (${contactEmail})`}
            onClick={() => handleCopy("email", contactEmail)}
          />
        </>
      )}
      <span aria-hidden className="w-px h-5 bg-foreground/10 mx-0.5" />
      <QuickButton
        icon={ExternalLink}
        label={`Open ${businessName}'s storefront`}
        href={storefrontUrl}
        tone="violet"
        external
      />
    </div>
  );
}
