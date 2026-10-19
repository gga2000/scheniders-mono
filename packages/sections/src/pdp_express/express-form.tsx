"use client";

// Express form: one page, one POST. Name and phone first; the delivery
// group opens on the first focus of either (so browser autofill can reach
// every field), the heading greets the shopper by first name once the name
// field is left, and the address prompt picks the name up too. Every field
// stays in the DOM — reveal is derived from values, so a restored or
// autofilled form opens itself.

import { useState } from "react";
import { IRAQ_GOVERNORATES, governorateLabel, cn, resolveI18n } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import type { FieldKey } from "../pdp_direct_order.client";
import type { ExpressModel } from "./model";
import { firstName, readsRtl, xs } from "./text";

const inputCls =
  "peer h-[52px] w-full rounded-bk-input border-bk border-bk-divider bg-bk-surface px-4 font-bk-body text-base text-bk-ink placeholder:text-bk-ink-faint transition-colors duration-bk-fast focus-visible:border-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus aria-[invalid=true]:border-bk-danger motion-reduce:transition-none";
const labelCls = "mb-1 block font-bk-body text-[13px] font-bold text-bk-ink-soft";
const errorCls = "mt-1 font-bk-body text-xs font-bold text-bk-danger";

export function ExpressForm({
  m,
  landmark,
  setLandmark,
}: {
  m: ExpressModel;
  landmark: string;
  setLandmark: (v: string) => void;
}) {
  const { locale, form, fieldErrors } = m;
  const rtl = readsRtl(locale);
  const [started, setStarted] = useState(false);
  const [greetName, setGreetName] = useState("");
  const [altOpen, setAltOpen] = useState(false);
  const [valid, setValid] = useState<Partial<Record<FieldKey, boolean>>>({});

  // Reveal is derived, never a one-way latch on typing: autofill, a
  // restored draft, or a submit error inside the group all open it.
  const deliveryOpen =
    started ||
    form.governorate_code !== "" ||
    form.address_details !== "" ||
    form.alt_phone !== "" ||
    landmark !== "" ||
    !!fieldErrors.governorate_code ||
    !!fieldErrors.address_details ||
    !!fieldErrors.alt_phone;
  const altVisible = altOpen || form.alt_phone !== "" || !!fieldErrors.alt_phone;

  const title =
    resolveI18n(m.props.express_form_title_i18n, locale) ||
    xs("formTitle", locale);
  const greeting = greetName
    ? (resolveI18n(m.props.greeting_i18n, locale) || xs("greeting", locale)).replace(
        "{name}",
        greetName,
      )
    : null;
  const prompt = greetName
    ? (resolveI18n(m.props.address_prompt_i18n, locale) ||
        xs("addressPromptNamed", locale)).replace("{name}", greetName)
    : xs("addressPrompt", locale);

  function onBlur(k: FieldKey) {
    m.validateOnBlur(k);
    const v = form[k].trim();
    setValid((prev) => ({ ...prev, [k]: v !== "" && m.fieldError(k, v) === null }));
    if (k === "customer_name") {
      const first = firstName(form.customer_name);
      setGreetName(first.length >= 2 ? first : "");
    }
  }

  function check(k: FieldKey) {
    return valid[k] && !fieldErrors[k] ? (
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-bk-success",
          rtl ? "left-3" : "right-3",
        )}
      >
        <MaterialIcon name="check_circle" className="text-xl" />
      </span>
    ) : null;
  }

  function err(k: FieldKey) {
    const e = fieldErrors[k];
    return e ? (
      <p id={m.errorId(k)} role="alert" className={errorCls}>
        {e}
      </p>
    ) : null;
  }

  const text = rtl ? "text-right" : "text-left";

  return (
    <div className="space-y-bk-sm" data-layer="form" data-layer-label="Order form">
      <div className={cn("relative min-h-[28px]", text)} aria-live="polite">
        <h2
          key={greeting ?? "title"}
          className="font-bk-display text-[17px] font-black leading-snug text-bk-ink motion-safe:animate-[bk-fade-up_var(--bk-duration-base)_ease-out_both]"
        >
          {greeting ?? title}
        </h2>
      </div>

      <div onFocusCapture={() => setStarted(true)} className="space-y-bk-sm">
        <div className={text}>
          <label htmlFor={m.fieldA11yCore("customer_name").id} className={labelCls}>
            {xs("nameLabel", locale)}
          </label>
          <div className="relative">
            <input
              type="text"
              name="name"
              required
              dir="auto"
              autoComplete="name"
              enterKeyHint="next"
              value={form.customer_name}
              onChange={(e) => m.set("customer_name", e.target.value)}
              onBlur={() => onBlur("customer_name")}
              className={cn(inputCls, text)}
              {...m.fieldA11yCore("customer_name")}
            />
            {check("customer_name")}
          </div>
          {err("customer_name")}
        </div>

        <div className={text}>
          <label htmlFor={m.fieldA11yCore("phone").id} className={labelCls}>
            {xs("phoneLabel", locale)}{" "}
            <span className="font-normal text-bk-ink-faint">
              ({xs("phoneHint", locale)})
            </span>
          </label>
          <div className="relative">
            <input
              type="tel"
              name="phone"
              required
              dir="ltr"
              inputMode="tel"
              autoComplete="tel-national"
              enterKeyHint="next"
              placeholder={m.s("phonePlaceholder")}
              value={form.phone}
              onChange={(e) => m.set("phone", e.target.value)}
              onBlur={() => onBlur("phone")}
              className={cn(inputCls, "text-left tabular-nums")}
              {...m.fieldA11yCore("phone")}
            />
            {check("phone")}
          </div>
          {err("phone")}
        </div>

        <div
          className="grid transition-[grid-template-rows] duration-bk-base ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: deliveryOpen ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden" inert={!deliveryOpen}>
            <div className="space-y-bk-sm pt-1">
              <p
                className={cn(
                  "flex items-center gap-1.5 font-bk-display text-[15px] font-black text-bk-ink",
                  rtl && "flex-row-reverse",
                )}
              >
                <MaterialIcon name="local_shipping" className="text-lg text-bk-ink-soft" />
                {prompt}
              </p>

              <div className={text}>
                <label
                  htmlFor={m.fieldA11yCore("governorate_code").id}
                  className={labelCls}
                >
                  {xs("governorateLabel", locale)}
                </label>
                <div className="relative">
                  <select
                    name="governorate"
                    required
                    autoComplete="address-level1"
                    value={form.governorate_code}
                    onChange={(e) => m.set("governorate_code", e.target.value)}
                    onBlur={() => onBlur("governorate_code")}
                    className={cn(inputCls, "appearance-none", text, rtl ? "pl-10" : "pr-10")}
                    {...m.fieldA11yCore("governorate_code")}
                  >
                    <option value="" disabled>
                      {m.s("governoratePlaceholder")}
                    </option>
                    {IRAQ_GOVERNORATES.map((g) => (
                      <option key={g.code} value={g.code}>
                        {governorateLabel(g.code, locale)}
                      </option>
                    ))}
                  </select>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute top-1/2 -translate-y-1/2 text-bk-ink-faint",
                      rtl ? "left-3" : "right-3",
                    )}
                  >
                    <MaterialIcon name="expand_more" className="text-xl" />
                  </span>
                </div>
                {err("governorate_code")}
              </div>

              <div className={text}>
                <label
                  htmlFor={m.fieldA11yCore("address_details").id}
                  className={labelCls}
                >
                  {xs("addressLabel", locale)}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="address"
                    required
                    dir="auto"
                    autoComplete="street-address"
                    enterKeyHint="next"
                    placeholder={xs("addressPlaceholder", locale)}
                    value={form.address_details}
                    onChange={(e) => m.set("address_details", e.target.value)}
                    onBlur={() => onBlur("address_details")}
                    className={cn(inputCls, text)}
                    {...m.fieldA11yCore("address_details")}
                  />
                  {check("address_details")}
                </div>
                {err("address_details")}
              </div>

              <div className={text}>
                <label htmlFor={`${m.submitErrorId}-landmark`} className={labelCls}>
                  {xs("landmarkLabel", locale)}{" "}
                  <span className="font-normal text-bk-ink-faint">
                    ({xs("optional", locale)})
                  </span>
                </label>
                <input
                  id={`${m.submitErrorId}-landmark`}
                  type="text"
                  name="landmark"
                  dir="auto"
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder={xs("landmarkPlaceholder", locale)}
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className={cn(inputCls, text)}
                />
              </div>

              {altVisible ? (
                <div className={text}>
                  <label htmlFor={m.fieldA11yCore("alt_phone").id} className={labelCls}>
                    {xs("altPhoneLabel", locale)}{" "}
                    <span className="font-normal text-bk-ink-faint">
                      ({xs("optional", locale)})
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      name="alt_phone"
                      dir="ltr"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder={m.s("phonePlaceholder")}
                      value={form.alt_phone}
                      onChange={(e) => m.set("alt_phone", e.target.value)}
                      onBlur={() => onBlur("alt_phone")}
                      className={cn(inputCls, "text-left tabular-nums")}
                      {...m.fieldA11yCore("alt_phone")}
                    />
                    {check("alt_phone")}
                  </div>
                  {err("alt_phone")}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAltOpen(true)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-1.5 font-bk-body text-sm font-bold text-bk-ink-soft",
                    rtl ? "flex-row-reverse" : "",
                  )}
                >
                  <MaterialIcon name="add_circle" className="text-lg" />
                  {xs("addAltPhone", locale)}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
