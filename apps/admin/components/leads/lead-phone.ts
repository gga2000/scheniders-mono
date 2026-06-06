// Iraqi phone normalizer — handles Arabic-Indic numerals, +964 / 00964 / leading-0.
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeIraqiPhone(input: string): string {
  if (!input) return "";
  let d = input
    .replace(/[٠-٩]/g, (x) => String(AR_DIGITS.indexOf(x)))
    .replace(/\D/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.startsWith("7")) d = "0" + d;
  return d;
}

export const isValidIraqiPhone = (v: string) => /^07\d{8,9}$/.test(normalizeIraqiPhone(v));
