/**
 * Iraqi governorates with the codes the Scheniders Platform OMS expects.
 * (Mirrors the platform's governorate dropdown.)
 */
export const IRAQ_GOVERNORATES = [
  { code: "BG", name: "بغداد" },
  { code: "BA", name: "البصرة" },
  { code: "ER", name: "أربيل" },
  { code: "SU", name: "السليمانية" },
  { code: "DH", name: "دهوك" },
  { code: "NI", name: "نينوى" },
  { code: "KI", name: "كركوك" },
  { code: "DI", name: "ديالى" },
  { code: "AN", name: "الأنبار" },
  { code: "BB", name: "بابل" },
  { code: "KE", name: "كربلاء" },
  { code: "NA", name: "النجف" },
  { code: "QA", name: "القادسية" },
  { code: "MU", name: "المثنى" },
  { code: "DQ", name: "ذي قار" },
  { code: "WA", name: "واسط" },
  { code: "MA", name: "ميسان" },
  { code: "SA", name: "صلاح الدين" },
] as const;

export type GovernorateCode = (typeof IRAQ_GOVERNORATES)[number]["code"];
