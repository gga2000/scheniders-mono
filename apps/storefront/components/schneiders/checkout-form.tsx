"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveSchneidersConfig } from "@scheniders/shared";
import type { SchneidersConfig } from "@scheniders/shared";
import { useStoreBase } from "@/lib/store-context";
import { useCart } from "@/lib/cart-store";
import { IRAQ_GOVERNORATES } from "@/lib/governorates";
import { submitCheckout } from "@/app/actions/checkout";
import { cn } from "@/lib/utils";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
  SectionEyebrow,
  Sticker,
  TrustPill,
  WhatsAppIcon,
} from "./primitives";
import { formatPrice } from "./format";
import { fillTemplate } from "./wa";

interface Props {
  tenantId: string;
  whatsappNumber?: string | null;
  schneidersConfig?: SchneidersConfig | null;
}

export function SchneidersCheckoutForm({ tenantId, whatsappNumber, schneidersConfig }: Props) {
  const schn = resolveSchneidersConfig(schneidersConfig);
  const router = useRouter();
  const storeBase = useStoreBase();
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getTotal());
  const clearCart = useCart((s) => s.clearCart);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => setMounted(true), []);

  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    governorate_code: "BG",
    city: "",
    address_details: "",
    notes: "",
  });

  // Resolve shipping fee + threshold per selected governorate.
  function resolveShipping(code: string): { fee: number; threshold: number; eta?: number } {
    const override = schn.shipping.governorate_pricing?.find((g) => g.code === code);
    if (override) {
      // Use baghdad threshold for BG, provinces threshold for others (overrides only set fee/eta).
      const threshold =
        code === "BG"
          ? (schn.shipping.baghdad_threshold_iqd ?? 75_000)
          : (schn.shipping.provinces_threshold_iqd ?? 100_000);
      return { fee: override.fee_iqd, threshold, eta: override.eta_hours };
    }
    if (code === "BG") {
      return {
        fee: schn.shipping.baghdad_fee_iqd ?? 5_000,
        threshold: schn.shipping.baghdad_threshold_iqd ?? 75_000,
        eta: schn.delivery_promise.baghdad_hours,
      };
    }
    return {
      fee: schn.shipping.provinces_fee_iqd ?? 7_500,
      threshold: schn.shipping.provinces_threshold_iqd ?? 100_000,
      eta: schn.delivery_promise.provinces_hours,
    };
  }

  const shipping = resolveShipping(form.governorate_code);
  const deliveryFee = subtotal >= shipping.threshold ? 0 : shipping.fee;
  const total = subtotal + deliveryFee;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    startTransition(async () => {
      const result = await submitCheckout({
        tenantId,
        customer: form,
        items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          name: i.name,
          variant_name: i.variant_name,
          price: i.price,
          quantity: i.quantity,
        })),
      });
      if (!result.success) {
        setError(result.error ?? "Couldn't place order. Try again or message us on WhatsApp.");
        return;
      }
      clearCart();
      router.push(`${storeBase}/checkout/success?order=${result.orderId}`);
    });
  }

  if (!mounted) {
    return (
      <div className="py-16 text-center font-display font-bold text-bk-ink/60">
        Loading checkout…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <BentoCard bg="lilac" rotate={1} className="p-8 text-center">
        <div className="text-5xl mb-2" style={{ transform: "rotate(-8deg)" }}>🛒</div>
        <h2 className="font-display font-black text-2xl uppercase mb-1">Cart is empty</h2>
        <p className="font-body text-sm text-bk-ink/80">Add something first ✨</p>
      </BentoCard>
    );
  }

  const itemsList = items
    .map((i) => `• ${i.name}${i.variant_name ? ` — ${i.variant_name}` : ""} × ${i.quantity}`)
    .join("\n");
  const waText = fillTemplate(schn.whatsapp_templates.cart_template ?? "", {
    items: itemsList,
    total: formatPrice(total),
  });
  const waHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(waText)}`
    : "#";

  return (
    <div className="space-y-6">
      {/* Progress strip */}
      <div className="flex items-center justify-center gap-2 font-display font-bold text-xs uppercase">
        <span className="px-3 py-1 rounded-full bento-card-sm bg-bk-success">Cart ✓</span>
        <span className="text-bk-ink/40">→</span>
        <span className="px-3 py-1 rounded-full bento-card-sm bg-bk-primary text-white">Details</span>
        <span className="text-bk-ink/40">→</span>
        <span className="px-3 py-1 rounded-full bento-card-sm bg-white opacity-60">Confirm</span>
      </div>

      {/* Reassurance */}
      <BentoCard bg="butter" rotate={-1} className="p-4">
        <div className="flex items-start gap-3">
          <MaterialIcon name="call" className="text-2xl drop-shadow-[2px_2px_0px_var(--bk-ink,#1a1a1a)]" />
          <div>
            <h3 className="font-display font-black text-base uppercase">
              We&apos;ll call you within {schn.reassurance.call_within_min} minutes
            </h3>
            <p className="font-body text-sm">To confirm your address and time. No upfront payment needed.</p>
          </div>
        </div>
      </BentoCard>

      {/* Order summary */}
      <BentoCard bg="white" className="p-5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between w-full"
        >
          <ScribbleHeading color="mint" as="h2">
            Your Order
          </ScribbleHeading>
          <MaterialIcon
            name="expand_more"
            className={cn("text-2xl transition-transform", expanded && "rotate-180")}
          />
        </button>
        {expanded && (
          <div className="space-y-2 mt-3 max-h-72 overflow-auto hide-scrollbar">
            {items.map((item) => (
              <div
                key={`${item.product_id}-${item.variant_id ?? "default"}`}
                className="flex justify-between font-body text-sm gap-2"
              >
                <span className="min-w-0 truncate">
                  {item.name}
                  {item.variant_name && <span className="text-bk-ink/50"> · {item.variant_name}</span>}
                  <span className="text-bk-ink/50"> × {item.quantity}</span>
                </span>
                <span className="font-bold whitespace-nowrap">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="border-t-[3px] border-dashed border-bk-ink/30 mt-4 pt-4 space-y-2 font-body text-sm">
          <Row label="Subtotal" value={formatPrice(subtotal)} />
          <Row
            label="Delivery"
            value={deliveryFee === 0 ? "FREE 🎉" : formatPrice(deliveryFee)}
            valueClass={deliveryFee === 0 ? "text-bk-success font-display font-black" : ""}
          />
        </div>
        <div className="border-t-[3px] border-dashed border-bk-ink/30 mt-3 pt-3 flex items-center justify-between">
          <span className="font-display font-black text-xl uppercase">Total</span>
          <span className="font-display font-black text-3xl">{formatPrice(total)}</span>
        </div>
      </BentoCard>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <BentoCard bg="white" className="p-5 space-y-4">
          <ScribbleHeading color="mint" as="h2">Delivery Details</ScribbleHeading>

          <Field
            label="Full Name"
            icon="person"
            id="customer_name"
            value={form.customer_name}
            onChange={(v) => setForm({ ...form, customer_name: v })}
            placeholder="Your name"
            required
            disabled={pending}
          />

          <PhoneField
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            disabled={pending}
          />

          <div className="grid grid-cols-1 gap-4">
            <div>
              <FieldShell label="Governorate" icon="location_on">
                <select
                  value={form.governorate_code}
                  onChange={(e) => setForm({ ...form, governorate_code: e.target.value })}
                  required
                  disabled={pending}
                  className="w-full bg-transparent font-body font-bold text-base focus:outline-none"
                >
                  {IRAQ_GOVERNORATES.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </FieldShell>
              {shipping.eta != null && (
                <p className="font-body text-xs text-bk-ink/60 mt-1">
                  Estimated arrival: {shipping.eta} hours
                </p>
              )}
            </div>

            <Field
              label="Area / Neighborhood"
              icon="map"
              id="city"
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v })}
              placeholder="e.g. Karrada"
              required
              disabled={pending}
            />
          </div>

          <FieldShell label="Full Address" icon="home">
            <textarea
              required
              disabled={pending}
              rows={3}
              value={form.address_details}
              onChange={(e) => setForm({ ...form, address_details: e.target.value })}
              placeholder="Street, building, floor, landmarks..."
              className="w-full bg-transparent font-body font-bold text-base focus:outline-none resize-none"
            />
          </FieldShell>

          <FieldShell label="Notes (optional)" icon="edit_note">
            <textarea
              disabled={pending}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Preferred delivery time, gate code..."
              className="w-full bg-transparent font-body font-bold text-base focus:outline-none resize-none"
            />
          </FieldShell>
        </BentoCard>

        {/* Payment method */}
        <BentoCard bg="white" className="p-5 space-y-3">
          <ScribbleHeading color="butter" as="h2">Payment Method</ScribbleHeading>

          {(() => {
            const enabled = schn.checkout.payment_methods_enabled ?? ["cod"];
            const all = [
              { key: "cod" as const, label: "💵 Cash on Delivery", helper: "Pay when you receive — inspect first" },
              { key: "card" as const, label: "💳 Credit / Debit Card", helper: "Pay securely online" },
              { key: "fastpay" as const, label: "📱 FastPay Wallet", helper: "Pay with your wallet" },
            ];
            return all.map((m, i) => {
              const isEnabled = enabled.includes(m.key);
              if (isEnabled) {
                return (
                  <div
                    key={m.key}
                    className="bento-card bg-bk-success p-4 ring-2 ring-bk-ink ring-offset-2 rotate-[0.5deg] relative"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full border-[3px] border-bk-ink flex items-center justify-center bg-white">
                        <div className="w-3 h-3 rounded-full bg-bk-ink" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display font-black uppercase text-base">{m.label}</p>
                        <p className="font-body text-xs">{m.helper}</p>
                      </div>
                      <MaterialIcon name="check_circle" className="text-2xl text-bk-ink" />
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={m.key}
                  className="bento-card-sm bg-bk-surface/60 p-3 flex items-center gap-3 opacity-60"
                >
                  <div className="w-6 h-6 rounded-full border-[3px] border-bk-ink/40 bg-white shrink-0" />
                  <p className="font-display font-bold uppercase text-sm flex-1">{m.label}</p>
                  <Sticker bg="butter" rotate={i % 2 === 0 ? -3 : 3} size="xs">Coming Soon</Sticker>
                </div>
              );
            });
          })()}
        </BentoCard>

        {/* Trust strip — checkout-specific override if configured, else global pills */}
        <section className="-mx-4 overflow-hidden">
          <div className="flex gap-3 px-4 overflow-x-auto hide-scrollbar pb-2">
            {(schn.checkout.trust_pills_override?.length ? schn.checkout.trust_pills_override : schn.trust_pills)
              .filter((p) => p.enabled !== false)
              .map((p, i) => (
                <TrustPill
                  key={`${p.label}-${i}`}
                  bg={p.bg ?? "mint"}
                  rotate={i % 2 === 0 ? 1 : -1}
                  icon={p.icon ? <MaterialIcon name={p.icon} className="text-lg" /> : undefined}
                >
                  {p.label}
                </TrustPill>
              ))}
          </div>
        </section>

        {error && (
          <BentoCard bg="pink" className="p-4 text-white">
            <p className="font-display font-bold text-sm">{error}</p>
          </BentoCard>
        )}

        {/* Primary CTA */}
        <ChunkyButton
          type="submit"
          bg="pink"
          size="lg"
          fullWidth
          disabled={pending}
          className="font-display font-black text-xl"
        >
          {pending ? "Placing order…" : `Place Order — ${formatPrice(total)}`}
          <MaterialIcon name="arrow_forward" className="text-xl" />
        </ChunkyButton>

        <p className="font-body text-xs text-center text-bk-ink/60">
          By placing this order, you agree to our{" "}
          <a href="../policies/terms" className="underline decoration-2">Terms</a> &amp;{" "}
          <a href="../policies/privacy" className="underline decoration-2">Privacy Policy</a>.
        </p>
      </form>

      {/* WhatsApp alternative */}
      {whatsappNumber && (
        <>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-[3px] bg-bk-ink/20" />
            <span className="font-display font-black text-sm uppercase text-bk-ink/60">OR</span>
            <div className="flex-1 h-[3px] bg-bk-ink/20" />
          </div>

          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="bento-card bg-white text-bk-ink font-display font-black text-base px-5 py-4 flex items-center justify-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all rounded-xl uppercase tracking-tight"
          >
            <WhatsAppIcon className="w-5 h-5 text-bk-success" />
            Place Order via WhatsApp Instead
          </a>
        </>
      )}

      {/* Support footer */}
      <div className="text-center font-body text-sm text-bk-ink/70">
        <SectionEyebrow>Need help?</SectionEyebrow>
        <div className="mt-1 flex items-center justify-center gap-3">
          <MaterialIcon name="call" />
          <span className="font-bold">Call us anytime</span>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  id,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  type = "text",
}: {
  label: string;
  icon: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <FieldShell label={label} icon={icon} htmlFor={id}>
      <input
        id={id}
        type={type}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent font-body font-bold text-base focus:outline-none placeholder:opacity-50"
      />
    </FieldShell>
  );
}

function PhoneField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <SectionEyebrow className="mb-1">
        <MaterialIcon name="call" className="text-sm align-middle mr-1" />
        Phone number
      </SectionEyebrow>
      <div className="flex gap-2">
        <span className="bento-card-sm bg-bk-accent rounded-xl px-3 py-3 font-display font-black text-base shrink-0">
          +964
        </span>
        <div className="flex-1 bento-card-sm bg-bk-surface rounded-xl px-4 py-3">
          <input
            type="tel"
            required
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="07XX XXX XXXX"
            className="w-full bg-transparent font-body font-bold text-base focus:outline-none placeholder:opacity-50"
          />
        </div>
      </div>
      <p className="font-body text-xs text-bk-ink/60 mt-1">We'll call to confirm your order.</p>
    </div>
  );
}

function FieldShell({
  label,
  icon,
  htmlFor,
  children,
}: {
  label: string;
  icon: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <SectionEyebrow className="mb-1 flex items-center gap-1">
        <MaterialIcon name={icon} className="text-sm" />
        {label}
      </SectionEyebrow>
      <div className="bento-card-sm bg-bk-surface rounded-xl px-4 py-3">{children}</div>
    </label>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-bk-ink/70">{label}</span>
      <span className={cn("font-bold", valueClass)}>{value}</span>
    </div>
  );
}
