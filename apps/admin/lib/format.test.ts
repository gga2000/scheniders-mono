import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCount, formatDateKey, formatDay, formatDayTime, formatIQD, formatMonth, formatUntil, formatUntilDay, formatWhen } from "./format";

describe("formatIQD", () => {
  it("writes whole dinars with commas and IQD after", () => {
    expect(formatIQD(43_800)).toBe("43,800 IQD");
    expect(formatIQD(0)).toBe("0 IQD");
    expect(formatIQD(1_250_000)).toBe("1,250,000 IQD");
    expect(formatIQD(-5_000)).toBe("-5,000 IQD");
  });

  it("rounds a fraction away", () => {
    expect(formatIQD(54.6)).toBe("55 IQD");
  });
});

describe("formatCount", () => {
  it("writes a count with commas", () => {
    expect(formatCount(5_445)).toBe("5,445");
    expect(formatCount(7)).toBe("7");
  });
});

describe("formatDay", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("writes the Baghdad day, without the year this year", () => {
    expect(formatDay("2026-11-15T09:00:00Z", now)).toBe("Sun 15 Nov");
  });

  it("takes the day in Baghdad, not in UTC", () => {
    // 22:30 UTC on the 15th is 01:30 on the 16th in Baghdad.
    expect(formatDay("2026-11-15T22:30:00Z", now)).toBe("Mon 16 Nov");
  });

  it("adds the year for another year", () => {
    expect(formatDay("2025-04-09T09:00:00Z", now)).toBe("Wed 9 Apr 2025");
  });

  it("writes every month in three letters, September too", () => {
    // en-GB wrote "Tue 1 Sept" (round 17, C-04).
    expect(formatDay("2026-09-01T09:00:00Z", now)).toBe("Tue 1 Sep");
    expect(formatDay("2025-09-30T09:00:00Z", now)).toBe("Tue 30 Sep 2025");
    expect(formatDayTime("2026-09-01T09:00:00Z", now)).toBe("Tue 1 Sep, 12:00");
  });

  it("takes the year in Baghdad, not in UTC", () => {
    // 21:30 UTC on 31 Dec is 00:30 on 1 Jan in Baghdad: this year, no year written.
    expect(formatDay("2025-12-31T21:30:00Z", now)).toBe("Thu 1 Jan");
  });

  it("adds the Baghdad time when asked", () => {
    expect(formatDayTime("2026-11-15T11:05:00Z", now)).toBe("Sun 15 Nov, 14:05");
  });
});

describe("formatDateKey", () => {
  it("writes a day key as a short date, with or without its year", () => {
    expect(formatDateKey("2025-11-23")).toBe("23 Nov 2025");
    expect(formatDateKey("2026-09-06", false)).toBe("6 Sep");
  });
});

describe("formatMonth", () => {
  it("writes a calendar month in three letters, with or without its year", () => {
    expect(formatMonth("2026-11")).toBe("Nov 2026");
    expect(formatMonth("2026-09")).toBe("Sep 2026");
    expect(formatMonth("2027-01", false)).toBe("Jan");
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("counts minutes and hours within the last day", () => {
    expect(formatWhen("2026-11-16T09:59:30Z", now)).toBe("just now");
    expect(formatWhen("2026-11-16T09:48:00Z", now)).toBe("12 min ago");
    expect(formatWhen("2026-11-16T05:00:00Z", now)).toBe("5 h ago");
    expect(formatWhen("2026-11-15T10:00:01Z", now)).toBe("23 h ago");
  });

  it("writes the day once a day has passed, never months ago", () => {
    expect(formatWhen("2026-11-15T10:00:00Z", now)).toBe("Sun 15 Nov");
    expect(formatWhen("2026-06-02T10:00:00Z", now)).toBe("Tue 2 Jun");
    expect(formatWhen("2025-04-09T09:00:00Z", now)).toBe("Wed 9 Apr 2025");
  });

  it("writes the day for a time still to come", () => {
    expect(formatWhen("2026-11-18T10:00:00Z", now)).toBe("Wed 18 Nov");
    expect(formatWhen("2026-11-16T10:00:20Z", now)).toBe("just now");
  });
});

describe("formatUntil", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("counts minutes, hours, then whole days", () => {
    expect(formatUntil("2026-11-16T10:40:00Z", now)).toBe("in 40 min");
    expect(formatUntil("2026-11-17T01:30:00Z", now)).toBe("in 15 h");
    expect(formatUntil("2026-11-17T12:00:00Z", now)).toBe("in 1 day");
    expect(formatUntil("2026-11-19T10:00:00Z", now)).toBe("in 3 days");
  });

  it("says ended once the time has passed", () => {
    expect(formatUntil("2026-11-16T09:59:00Z", now)).toBe("ended");
  });
});

describe("formatUntilDay", () => {
  // Tue 17 Nov, 22:00 in Baghdad.
  const now = new Date("2026-11-17T19:00:00Z");

  it("counts Baghdad days past one day, as the Trials page does", () => {
    // Ends Fri 20 Nov, 06:00 Baghdad: Trials says "3 days left"; whole 24-hour spans said "in 2 days".
    expect(formatUntil("2026-11-20T03:00:00Z", now)).toBe("in 2 days");
    expect(formatUntilDay("2026-11-20T03:00:00Z", now)).toBe("in 3 days");
    // Ends Thu 19 Nov, 23:00 Baghdad: 49 hours, two days on the calendar.
    expect(formatUntilDay("2026-11-19T20:00:00Z", now)).toBe("in 2 days");
  });

  it("says tomorrow for more than a day that ends on the next Baghdad day", () => {
    const justAfterMidnight = new Date("2026-11-16T21:30:00Z"); // Tue 17 Nov, 00:30 Baghdad
    expect(formatUntilDay("2026-11-18T20:00:00Z", justAfterMidnight)).toBe("tomorrow");
  });

  it("keeps hours and minutes under a day, and ended once passed", () => {
    expect(formatUntilDay("2026-11-18T03:00:00Z", now)).toBe("in 8 h");
    expect(formatUntilDay("2026-11-17T19:40:00Z", now)).toBe("in 40 min");
    expect(formatUntilDay("2026-11-17T18:59:00Z", now)).toBe("ended");
  });
});

/*
 * Round 15 (data lane 3): Support Today's "Trial ends 21 Nov" and View as
 * merchant's "Look only, until 14:05" used the browser's clock, so a staff
 * member whose laptop ran another zone saw another day or hour than every
 * other screen. Every day and time the console shows is Baghdad's: through
 * lib/format, or with timeZone written into the call.
 */
const ADMIN_DIR = path.resolve(__dirname, "..");
const BROWSER_CLOCK = [
  /\.toLocale(?:Date|Time)String\((?![^)]*timeZone)[^)]*\)/g,
  // A number's toLocaleString is fine; a date's is the browser's clock unless it names a zone.
  /new Date\([^)]*\)\.toLocaleString\((?![^)]*timeZone)[^)]*\)/g,
  /\.toLocaleString\((?![^)]*timeZone)[^)]*\b(?:weekday|year|month|day|hour|minute)\b[^)]*\)/g,
  /\.(?:toDateString|getHours|setHours|getDate|setDate|getDay|getMonth|getFullYear)\(/g,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test(-data)?\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("the console's days and times", () => {
  it("never read the browser's clock zone", () => {
    const found: string[] = [];
    for (const dir of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(path.join(ADMIN_DIR, dir))) {
        const text = readFileSync(file, "utf8");
        for (const pattern of BROWSER_CLOCK) {
          for (const match of text.match(pattern) ?? []) {
            found.push(`${path.relative(ADMIN_DIR, file).split(path.sep).join("/")}: ${match}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});

/*
 * Round 17 (C-04): a bare toLocaleString() writes a number in the browser's
 * language, so a staff member whose browser runs Arabic read "١٬٢٥٠" for
 * followers on Leads, and German "1.250", where every other screen says
 * "1,250". Every number goes through formatCount or formatIQD, or names its
 * locale.
 */
// en-GB spells September "Sept" and every other month in three letters (round 17, C-04).
const FOUR_LETTER_SEPTEMBER = /(?:Intl\.DateTimeFormat|toLocale(?:Date)?String)\(\s*"en-GB"[^;]*?month:\s*"short"/g;
const BROWSER_LANGUAGE = [/\.toLocaleString\(\s*(?:undefined\s*)?[,)]/g, /Intl\.NumberFormat\(\s*(?:undefined\s*)?[,)]/g];

describe("the console's numbers and months", () => {
  it("never take the browser's language, nor en-GB's four-letter September", () => {
    const found: string[] = [];
    for (const dir of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(path.join(ADMIN_DIR, dir))) {
        const text = readFileSync(file, "utf8");
        for (const pattern of [...BROWSER_LANGUAGE, FOUR_LETTER_SEPTEMBER]) {
          for (const match of text.match(pattern) ?? []) {
            found.push(`${path.relative(ADMIN_DIR, file).split(path.sep).join("/")}: ${match}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});

/*
 * Round 18 (structure 4, data 9): a month was written "Nov 26" on Revenue
 * (read as 26 November), "Nov 2026" on Paying and "November 2026" on
 * WhatsApp, and the Team chart named a day "Nov 18" beside Home's "18 Nov".
 * Each screen had built its own formatter. Months and days are written by
 * lib/format and counted by lib/baghdad-day, and nowhere else.
 */
const OWN_DATE_FORMAT = /(?:Intl\.DateTimeFormat|\.toLocaleDateString)\(/g;

describe("the console's months and days", () => {
  it("are written only by lib/format and lib/baghdad-day", () => {
    const found: string[] = [];
    for (const dir of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(path.join(ADMIN_DIR, dir))) {
        const name = path.relative(ADMIN_DIR, file).split(path.sep).join("/");
        if (name === "lib/format.ts" || name === "lib/baghdad-day.ts") continue;
        for (const match of readFileSync(file, "utf8").match(OWN_DATE_FORMAT) ?? []) found.push(`${name}: ${match}`);
      }
    }
    expect(found).toEqual([]);
  });
});
