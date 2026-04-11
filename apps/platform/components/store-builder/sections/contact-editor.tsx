"use client";

import { MessageCircle, Instagram, Facebook, Music } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactEditorProps {
  whatsapp: string;
  setWhatsapp: (v: string) => void;
  instagram: string;
  setInstagram: (v: string) => void;
  facebook: string;
  setFacebook: (v: string) => void;
  tiktok: string;
  setTiktok: (v: string) => void;
  enableWhatsappOrder: boolean;
  setEnableWhatsappOrder: (v: boolean) => void;
}

const SOCIAL_FIELDS = [
  {
    key: "whatsapp" as const,
    label: "WhatsApp",
    icon: MessageCircle,
    placeholder: "+971 50 123 4567",
    iconColor: "text-green-700",
    colorVar: "--pastel-green",
  },
  {
    key: "instagram" as const,
    label: "Instagram",
    icon: Instagram,
    placeholder: "@yourstore",
    iconColor: "text-pink-700",
    colorVar: "--pastel-pink",
  },
  {
    key: "facebook" as const,
    label: "Facebook",
    icon: Facebook,
    placeholder: "facebook.com/yourstore",
    iconColor: "text-blue-700",
    colorVar: "--pastel-blue",
  },
  {
    key: "tiktok" as const,
    label: "TikTok",
    icon: Music,
    placeholder: "@yourstore",
    iconColor: "text-purple-700",
    colorVar: "--pastel-purple",
  },
] as const;

export function ContactEditor({
  whatsapp,
  setWhatsapp,
  instagram,
  setInstagram,
  facebook,
  setFacebook,
  tiktok,
  setTiktok,
  enableWhatsappOrder,
  setEnableWhatsappOrder,
}: ContactEditorProps) {
  const values: Record<string, string> = { whatsapp, instagram, facebook, tiktok };
  const setters: Record<string, (v: string) => void> = {
    whatsapp: setWhatsapp,
    instagram: setInstagram,
    facebook: setFacebook,
    tiktok: setTiktok,
  };

  return (
    <div data-tour-id="contact-editor">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-green)" }}
        >
          <MessageCircle className="w-4 h-4 text-green-700" />
        </div>
        <h3 className="text-lg font-semibold">Contact &amp; Social</h3>
      </div>

      {/* Social inputs — 2 column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SOCIAL_FIELDS.map((field) => {
          const Icon = field.icon;
          return (
            <div key={field.key} className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ backgroundColor: `var(${field.colorVar})` }}
                >
                  <Icon className={cn("w-3 h-3", field.iconColor)} />
                </span>
                {field.label}
              </label>
              <input
                type="text"
                value={values[field.key]}
                onChange={(e) => setters[field.key](e.target.value)}
                placeholder={field.placeholder}
                className={cn(
                  "w-full rounded-xl px-4 py-2.5 text-sm",
                  "border border-(--card-border) bg-background",
                  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                  "transition-colors"
                )}
              />
            </div>
          );
        })}
      </div>

      {/* WhatsApp ordering toggle */}
      <div
        className={cn(
          "mt-5 flex items-center justify-between rounded-xl px-4 py-3",
          "border border-(--card-border)"
        )}
        style={{ backgroundColor: "var(--card-bg)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--pastel-green)" }}
          >
            <MessageCircle className="w-4 h-4 text-green-700" />
          </div>
          <div>
            <p className="text-sm font-medium">WhatsApp Ordering</p>
            <p className="text-xs text-muted-foreground">
              Let customers place orders via WhatsApp
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enableWhatsappOrder}
          onClick={() => setEnableWhatsappOrder(!enableWhatsappOrder)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
            "border-2 border-transparent transition-colors",
            enableWhatsappOrder ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full",
              "bg-white shadow-sm ring-0 transition-transform",
              enableWhatsappOrder ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>
    </div>
  );
}
