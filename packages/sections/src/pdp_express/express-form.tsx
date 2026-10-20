"use client";

// Express form: one page, one POST, asked a step at a time. Only the
// mobile number shows first — grouped "0780 230 1677" as it is typed, with
// a specific reason when it cannot be an Iraqi mobile, and a hint that the
// rest opens once it is complete. Then the details open in stages:
//
//   phone → name → governorate + area/street → landmark + backup number
//
// The name stage opens on a valid number; the address stage once the name
// has 2+ letters and the shopper paused or left the field; the last stage
// once a governorate is chosen and an address typed. Every field stays in
// the DOM (a closed stage is collapsed and inert), and each stage's
// openness is derived from the current values, errors and focus — never a
// one-way latch on typing — so a restored form or a submit error inside a
// stage opens it (and every stage before it), and a stage stays open while
// a field inside it has focus. The greeting waits for the shopper to leave
// the name field, so it never greets a half-typed name.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IRAQ_GOVERNORATES, governorateLabel, cn, resolveI18n } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import type { FieldElement, FieldKey } from "../pdp_direct_order.client";
import type { ExpressModel } from "./model";
import { IRAQI_MOBILE_DIGITS, phoneDigits, phoneIssue, type PhoneIssue } from "./phone";
import { firstName, readsRtl, xs } from "./text";
import { usePhoneInput } from "./use-phone-input";

const inputCls =
  "h-[52px] w-full rounded-bk-input border-bk border-bk-divider bg-bk-surface px-4 font-bk-body text-base text-bk-ink placeholder:text-bk-ink-faint transition-colors duration-bk-fast focus-visible:border-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus aria-[invalid=true]:border-bk-danger motion-reduce:transition-none";
const labelCls = "mb-1 block font-bk-body text-[13px] font-bold text-bk-ink-soft";
const errorCls = "mt-1 font-bk-body text-xs font-bold text-bk-danger";
/** Grouped phone digits read left to right in every locale. */
const phoneInputCls = "pr-10 text-left tabular-nums";

/** How long a typed name (2+ letters) rests before the address stage
 *  opens without waiting for the shopper to leave the field. Input
 *  debounce, not an animation — motion durations come from --bk-*. */
const NAME_SETTLE_MS = 900;

const ISSUE_KEY: Record<PhoneIssue, "phoneShort" | "phoneLong" | "phonePrefix" | "phoneOperator"> = {
  short: "phoneShort",
  long: "phoneLong",
  prefix: "phonePrefix",
  operator: "phoneOperator",
};

type StageStep = "name" | "address" | "extras";

/** A collapsible step: grid rows 0fr → 1fr, inert while closed. The clip
 *  box is widened by the inner padding so focus rings are not cut off.
 *  It reports focus entering and leaving it, so the form can keep a stage
 *  open under the field being edited. */
function Stage({
  open,
  step,
  onFocusWithin,
  children,
}: {
  open: boolean;
  step: StageStep;
  onFocusWithin: (step: StageStep, inside: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div
      data-stage={step}
      data-open={open ? "true" : "false"}
      className="grid transition-[grid-template-rows] duration-bk-base ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      onFocus={() => onFocusWithin(step, true)}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node && e.currentTarget.contains(next))) {
          onFocusWithin(step, false);
        }
      }}
    >
      <div className="-mx-1 min-h-0 overflow-hidden" inert={!open}>
        <div className="space-y-bk-sm px-1 pb-1 pt-bk-sm">{children}</div>
      </div>
    </div>
  );
}

/** One block inside a stage, rising in as the stage opens; `late` blocks
 *  follow a beat behind the first so the pair reads as a sequence. */
function StageItem({
  open,
  late = false,
  className,
  children,
}: {
  open: boolean;
  late?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-[opacity,transform] duration-bk-base ease-out motion-reduce:transition-none",
        open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        // The beat is motion too: the tenant motion-off toggle zeroes
        // durations but not delays, so it zeroes this one itself (the OS
        // setting already drops the transition via motion-reduce).
        late && open && "delay-[var(--bk-duration-fast)] [[data-bk-motion=reduce]_&]:delay-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
  const [altOpen, setAltOpen] = useState(false);
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  // The governorate a returning shopper's cookie prefilled: it is not
  // something typed this visit, so it alone does not open its stage.
  const [initialGovernorate] = useState(form.governorate_code);

  // The name as it stood when the shopper last paused or left the field.
  // It only opens the address stage: a pause can land mid-word.
  const [settledName, setSettledName] = useState("");
  // The name as it stood when the shopper last LEFT the field — the only
  // moment it is known to be finished, so the greeting is built from it.
  const [greetedName, setGreetedName] = useState("");
  const name = form.customer_name.trim();
  useEffect(() => {
    if (name.length < 2 || name === settledName) return;
    const timer = window.setTimeout(() => setSettledName(name), NAME_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [name, settledName]);

  const phone = usePhoneInput(form.phone, (v) => m.set("phone", v));
  const altPhone = usePhoneInput(form.alt_phone, (v) => m.set("alt_phone", v));

  const digits = phoneDigits(form.phone);
  const liveIssue = phoneIssue(digits, phoneBlurred);
  const phoneComplete =
    digits.length === IRAQI_MOBILE_DIGITS && phoneIssue(digits, true) === null;

  // The stage holding focus. A stage never closes under the field being
  // edited: a submit error can be the only thing holding a stage open, and
  // typing clears that error — collapsing (and inerting) the stage there
  // would drop focus and close the mobile keyboard mid-correction.
  const [focusStage, setFocusStage] = useState<StageStep | null>(null);
  const onStageFocus = (step: StageStep, inside: boolean) =>
    setFocusStage((cur) => (inside ? step : cur === step ? null : cur));

  // Stage openness, last stage first: a stage with content, an error or
  // focus opens itself and every stage before it.
  const hasError = (k: FieldKey) => !!fieldErrors[k];
  const extrasOpen =
    (form.governorate_code !== "" && form.address_details.trim() !== "") ||
    landmark !== "" ||
    form.alt_phone !== "" ||
    hasError("alt_phone") ||
    focusStage === "extras";
  const nameReady = name.length >= 2 && settledName.length >= 2;
  const addressOpen =
    nameReady ||
    form.address_details !== "" ||
    form.governorate_code !== initialGovernorate ||
    hasError("governorate_code") ||
    hasError("address_details") ||
    focusStage === "address" ||
    extrasOpen;
  const nameOpen =
    phoneComplete ||
    form.customer_name !== "" ||
    hasError("customer_name") ||
    focusStage === "name" ||
    addressOpen;
  const altVisible = altOpen || form.alt_phone !== "" || hasError("alt_phone");

  // The backup number field replaces the button that opened it, so focus
  // moves into the field instead of falling back to the page.
  const altEl = useRef<HTMLInputElement | null>(null);
  const focusAltOnOpen = useRef(false);
  useLayoutEffect(() => {
    if (altVisible && focusAltOnOpen.current) {
      focusAltOnOpen.current = false;
      altEl.current?.focus();
    }
  }, [altVisible]);

  // The greeting uses the name as it was when the shopper left the field,
  // and only while it still matches the CURRENT first word: editing the
  // first word drops it back to the title until the field is left again.
  const greetedFirst = firstName(greetedName);
  const greetName =
    greetedFirst.length >= 2 && firstName(name) === greetedFirst ? greetedFirst : "";
  const title =
    resolveI18n(m.props.express_form_title_i18n, locale) ||
    xs("formTitle", locale);
  const heading = greetName
    ? (resolveI18n(m.props.greeting_i18n, locale) || xs("greeting", locale)).replace(
        "{name}",
        greetName,
      )
    : title;
  const prompt = greetName
    ? (resolveI18n(m.props.address_prompt_i18n, locale) ||
        xs("addressPromptNamed", locale)).replace("{name}", greetName)
    : xs("addressPrompt", locale);

  function onBlur(k: FieldKey) {
    m.validateOnBlur(k);
    setTouched((prev) => (prev[k] ? prev : { ...prev, [k]: true }));
    if (k === "customer_name") {
      setSettledName(name);
      setGreetedName(name);
    }
  }

  /** Success tick, derived from the current value: shown only for a
   *  touched field whose value passes validation right now. */
  function isValidNow(k: FieldKey): boolean {
    const v = form[k];
    if (!touched[k] || v.trim() === "" || fieldErrors[k] || m.fieldError(k, v) !== null) {
      return false;
    }
    // The backup number gets the same operator check as the main one.
    return k !== "alt_phone" || phoneIssue(phoneDigits(v), true) === null;
  }

  /** The check icon. LTR phone inputs pin it right (their digits start on
   *  the left in every locale); other inputs put it on the end side. */
  function tick(show: boolean, ltrInput: boolean) {
    return show ? (
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-bk-success",
          ltrInput || !rtl ? "right-3" : "left-3",
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
  const iconPad = rtl ? "pl-10" : "pr-10";
  const phoneA11y = m.fieldA11yCore("phone");
  const altA11y = m.fieldA11yCore("alt_phone");
  // A live reason wins over the generic submit-time message.
  const phoneMessage = liveIssue
    ? xs(ISSUE_KEY[liveIssue], locale, { count: digits.length })
    : (fieldErrors.phone ?? null);
  const hintId = `${phoneA11y.id}-next`;
  const showNextHint = digits.length > 0 && !phoneComplete && !phoneMessage && !nameOpen;

  return (
    <div data-layer="form" data-layer-label="Order form">
      {/* Stable live region: only the inner span is swapped (and animated)
          when the greeting replaces the title. */}
      <h2
        aria-live="polite"
        className={cn("font-bk-display text-[17px] font-black leading-snug text-bk-ink", text)}
      >
        <span
          key={heading}
          className="block motion-safe:animate-[bk-fade-up_var(--bk-duration-base)_ease-out_both]"
        >
          {heading}
        </span>
      </h2>

      <div className={cn("mt-bk-sm", text)}>
        <label htmlFor={phoneA11y.id} className={labelCls}>
          {xs("phoneLabel", locale)}{" "}
          <span className="font-normal text-bk-ink-faint">({xs("phoneHint", locale)})</span>
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
            onChange={phone.onChange}
            onBlur={() => {
              setPhoneBlurred(true);
              onBlur("phone");
            }}
            className={cn(inputCls, phoneInputCls, "text-[17px] font-bold tracking-wide")}
            id={phoneA11y.id}
            aria-invalid={phoneMessage ? true : undefined}
            aria-describedby={
              phoneMessage ? m.errorId("phone") : showNextHint ? hintId : undefined
            }
            ref={(el: FieldElement | null) => {
              phoneA11y.ref(el);
              phone.bind(el instanceof HTMLInputElement ? el : null);
            }}
          />
          {tick(phoneComplete && !fieldErrors.phone, true)}
        </div>
        {phoneMessage ? (
          <p id={m.errorId("phone")} role="alert" className={errorCls}>
            {phoneMessage}
          </p>
        ) : showNextHint ? (
          <p
            id={hintId}
            className={cn(
              "mt-1 flex items-center gap-1 font-bk-body text-xs text-bk-ink-soft motion-safe:animate-[bk-fade-up_var(--bk-duration-base)_ease-out_both]",
              rtl && "flex-row-reverse",
            )}
          >
            <MaterialIcon name="arrow_downward" className="text-base" />
            <span>{xs("phoneNextHint", locale)}</span>
          </p>
        ) : null}
      </div>

      <Stage open={nameOpen} step="name" onFocusWithin={onStageFocus}>
        <StageItem open={nameOpen} className={text}>
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
              className={cn(inputCls, text, iconPad)}
              {...m.fieldA11yCore("customer_name")}
            />
            {tick(isValidNow("customer_name"), false)}
          </div>
          {err("customer_name")}
        </StageItem>
      </Stage>

      <Stage open={addressOpen} step="address" onFocusWithin={onStageFocus}>
        <StageItem open={addressOpen}>
          <p
            className={cn(
              "flex items-center gap-1.5 font-bk-display text-[15px] font-black text-bk-ink",
              rtl && "flex-row-reverse",
            )}
          >
            <MaterialIcon name="local_shipping" className="text-lg text-bk-ink-soft" />
            {prompt}
          </p>
        </StageItem>

        <StageItem open={addressOpen} className={text}>
          <label htmlFor={m.fieldA11yCore("governorate_code").id} className={labelCls}>
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
              className={cn(inputCls, "appearance-none", text, iconPad)}
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
        </StageItem>

        <StageItem open={addressOpen} late className={text}>
          <label htmlFor={m.fieldA11yCore("address_details").id} className={labelCls}>
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
              className={cn(inputCls, text, iconPad)}
              {...m.fieldA11yCore("address_details")}
            />
            {tick(isValidNow("address_details"), false)}
          </div>
          {err("address_details")}
        </StageItem>
      </Stage>

      <Stage open={extrasOpen} step="extras" onFocusWithin={onStageFocus}>
        <StageItem open={extrasOpen} className={text}>
          <label htmlFor={`${m.submitErrorId}-landmark`} className={labelCls}>
            {xs("landmarkLabel", locale)}{" "}
            <span className="font-normal text-bk-ink-faint">({xs("optional", locale)})</span>
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
        </StageItem>

        <StageItem open={extrasOpen} late className={altVisible ? text : undefined}>
          {altVisible ? (
            <>
              <label htmlFor={altA11y.id} className={labelCls}>
                {xs("altPhoneLabel", locale)}{" "}
                <span className="font-normal text-bk-ink-faint">({xs("optional", locale)})</span>
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
                  onChange={altPhone.onChange}
                  onBlur={() => onBlur("alt_phone")}
                  className={cn(inputCls, phoneInputCls)}
                  id={altA11y.id}
                  aria-invalid={altA11y["aria-invalid"]}
                  aria-describedby={altA11y["aria-describedby"]}
                  ref={(el: FieldElement | null) => {
                    altA11y.ref(el);
                    const input = el instanceof HTMLInputElement ? el : null;
                    altPhone.bind(input);
                    altEl.current = input;
                  }}
                />
                {tick(isValidNow("alt_phone"), true)}
              </div>
              {err("alt_phone")}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                focusAltOnOpen.current = true;
                setAltOpen(true);
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-1.5 font-bk-body text-sm font-bold text-bk-ink-soft",
                rtl && "flex-row-reverse",
              )}
            >
              <MaterialIcon name="add_circle" className="text-lg" />
              {xs("addAltPhone", locale)}
            </button>
          )}
        </StageItem>
      </Stage>
    </div>
  );
}
