# Iraq locations database — handoff

**Status 2026-10-10.** Written for whoever (or whatever) picks this up next, with no memory of
how it got here. Everything below was verified against the live NEW Supabase project
`sduvpgqwhxragxtxztur` on that date.

---

## What this is

An Iraq geography database **we own**, seeded once from the Al-Waseet courier catalogue and then
frozen. Al-Waseet is recorded as one *source* in `iraq_location_carrier_refs`, not as the schema.
The original brief: "copy their database and use it in my app for different features… build a
state of the art world class database first."

| | |
|---|---|
| Active locations | 5,865 |
| Placed in a district | **3,986 (68.0%)** |
| Districts | 276 — 126 sourced qadhas + 15 Baghdad بلديات + derived `area_cluster` rows |
| Gazetteer areas | 1,405 |
| Aliases | 6,592 |
| `needs_review` | 199 |
| Unresolved duplicate pairs | 49 |
| Address resolver | **84.4%** on real order addresses (87.5% of answerable) |

All of it is committed on `feat/notifications-overhaul` in `cf3af703` and `f095120d`, and all 64
migration files under `packages/supabase/migrations/` match what is applied to the remote.

---

## Schema

| Object | Purpose |
|---|---|
| `iraq_governorates` | 18 rows, the 3-letter codes `orders` already uses |
| `iraq_districts` | qadha / municipality / `area_cluster`. `kind` and `source` keep sourced and derived separable |
| `iraq_district_areas` | area → district gazetteer. `area_key` is generated; this is the table the matcher reads |
| `iraq_locations` | one row per real place. `district_source` ∈ gazetteer / adjacency / bracketed / manual |
| `iraq_location_aliases` | every other spelling, incl. collapsed duplicates. `alias_key` is generated |
| `iraq_location_carrier_refs` | every Al-Waseet id, duplicates included, so a historical order still resolves |
| `iraq_location_reviews` | pairs a human still has to judge |
| `iraq_postal_codes` | 348 official codes, independent reference data |

Functions worth knowing:

- `iraq_resolve_address(text, gov_code)` — **the one to call.** Free text → location, scoped to a
  governorate. Returns at most one row; `confidence` is `exact` / `contains` / `fuzzy` when an
  area matched, or `district` when only a قضاء could be identified (`location_id` is then NULL).
- `iraq_resolve_location(...)` — superseded, still present only because replacing it needed a
  `DROP` that was declined. Do not build on it.
- `iraq_refresh_location_districts()` — recomputes every `district_source = 'gazetteer'`
  placement. Run it after touching `iraq_district_areas`. Returns the new placed count.
- `iraq_flag_ambiguous_placements()` — flags rows where the ranking ended in a tie.
- `iraq_district_identity_key(name)` — folds the definite article, ة/ه and أ/إ/آ/ء. A unique
  index on `(governorate_code, iraq_district_identity_key(name_ar))` stops duplicate districts.

---

## The placement ranking, and why each rule exists

In `iraq_refresh_location_districts()`, in order. Every one of these was added only after it was
seen to fix real rows, and three of them exist because an earlier version got rows wrong.

1. **A governorate name inside a longer name is a qualifier, so it ranks last.** Al-Waseet
   prefixes the governorate to disambiguate — "كربلاء الهنديه" means Hindiya, not Karbala. It
   still wins when nothing else matches, so "مصفى كربلاء" stays in Karbala.
2. **Strong own-name: a row naming a district outright beats a longer phrase matching another
   district's area** — "تلعفر حي القادسية" belongs to تلعفر even though "قادسيه" is longer.
3. **…unless a longer matched phrase *contains* that name.** This guard is load-bearing. Without
   it `كرادة مريم` leaves الكرخ for الكرادة, `ناحية الرشيد` leaves المحمودية for بلدية الرشيد,
   `صوب الشامية` leaves الديوانية for قضاء الشامية, and `قلعة السكر` leaves الرفاعي.
4. Then length, then own-name, then **a sourced qadha/بلدية beats a derived `area_cluster`**, then
   `district_id` as a deterministic last resort.

Residual coin-flips: **441 → 14**. The remaining 14 are flagged with both rival names in
`review_reason`.

---

## Method that worked — reuse it

### Adding a city gazetteer

Six capital cities are done. Measured yields: **Mosul +123, Najaf +91, Karbala +36, Hilla +34,
Diwaniyah +34, Kirkuk +24, Samawah +16, Sulaymaniyah +15, Erbil +7.**

**A table of quarters pays; a prose bullet list does not.** Detect which exists before spending
time on a city:

```bash
curl -sG 'https://ar.wikipedia.org/w/api.php' \
  --data-urlencode 'action=parse' --data-urlencode 'page=<CITY>' \
  --data-urlencode 'prop=wikitext' --data-urlencode 'format=json' --data-urlencode 'redirects=1'
# then look for class="wikitable" whose caption mentions أحياء or محلات
```

**Search the city article, not an external site.** The first Karbala pass went to the University
of Karbala page, got 14 prose names and +13 rows. The ar.wikipedia كربلاء article has a staged
table plus a 57-cell grid and was worth +36. The same mistake would have cost Hilla and Samawah.

**Then check every proposed name for collisions before inserting.** A quarter name that is
already a ناحية elsewhere in the same governorate creates a guaranteed coin-flip. This caught
`القادسية` in Najaf (already ناحية القادسية under المشخاب), `شورش` in Sulaymaniyah (under
جمجمال), and `اليرموك` / `القادسية` / `الطاقة` in Karbala (areas of قضاء الحر):

```sql
with proposed(area) as (values ('…'),('…'))
select p.area,
       (select string_agg(d.name_ar,', ') from iraq_districts d
         where d.governorate_code = '<GOV>' and d.id <> <TARGET_DISTRICT>
           and iraq_district_identity_key(d.name_ar)
             = waseet_strip_article(waseet_search_key(p.area))) is_another_district,
       (select string_agg(d2.name_ar,', ') from iraq_district_areas a
          join iraq_districts d2 on d2.id = a.district_id
         where d2.governorate_code = '<GOV>' and d2.id <> <TARGET_DISTRICT>
           and a.area_key = waseet_strip_article(waseet_search_key(p.area))) area_of_another
  from proposed p;
```

Then `select iraq_refresh_location_districts();` and
`select iraq_flag_ambiguous_placements();` — the second should not climb.

### Changing a ranking rule

**Diff the candidate ranking against the live one and read every changed row before applying.**
The own-name reordering was tried three ways: 42 changes with 6 regressions; 33 with 1; and an
`is_sourced`-gated variant that looked tighter but collapsed dozens of "المزرعة - القرنه" rows up
to the qadha and broke "عامرية الفلوجة". Only the middle one shipped. Build both orderings as
CTEs over the same `hit` set, `DISTINCT ON (id)` each, and join them.

---

## Traps that already cost real time

- **`orders.city` is the GOVERNORATE, not an area.** It holds "بغداد", "البصرة". Feeding it to the
  resolver produces a meaningless number that is ~90% fuzzy hits.
- **79% of `orders.address_details` is templated demo data** — 18,051 of 22,779 rows match
  `^حي [^,]+, شارع [^,]+, (بجانب|قرب|خلف|مقابل)`, one address repeated 308 times. Any benchmark
  must exclude that pattern *and* the non-addresses (`تفاصيل غير متوفره`, `قضاء`, bare governorate
  names, junk under 4 chars).
- **`iraq_flag_ambiguous_placements()` only catches TIES.** A rule that produces a clean but wrong
  single winner is *not* flagged — verified on "قرة تبة حي الشهداء", which sat at
  `review_status 'ok'` while being wrong. Such rows need `district_is_manual = true`, which the
  refresh respects.
- **Arabic punctuation lives inside the Arabic Unicode block** (`،` U+060C, `؛`, `؟`), so
  `waseet_search_key` deliberately keeps it and `الجهاد،` stays one token. `iraq_resolve_address`
  translates it to spaces on input. The catalogue itself is clean of it, so do **not** change
  `waseet_search_key` — that would rewrite every generated column for no change in stored values.
- **`mcp__supabase__apply_migration` writes nothing to disk.** It records the migration in the
  remote only. Export it to `packages/supabase/migrations/<version>_<name>.sql` in the same turn
  and verify with a whitespace-stripped md5 against
  `md5(regexp_replace(array_to_string(statements,' '), '\s+','','g'))`. Do not strip the trailing
  `;`. 30 migrations once existed only in the remote; recovering them took a whole session.
- **Two deletions were declined** in this engagement (a `DROP FUNCTION` and a junk-district
  `DELETE`). Both had clean additive alternatives — a new function, and a `district_is_manual`
  override. Prefer additive first; don't re-propose the destructive form.
- **Catalogue-position (id-block) inference works in Baghdad and nowhere else.** Tested and
  rejected for Karbala (one anchor in 40 rows) and Erbil (the block interleaves كويسنجق /
  شقلاوة / خبات with city entries).
- **Measure an inference rule before applying it.** Majority-of-id-neighbours scored 59.7% and was
  rejected — a 40% error rate would put wrong civic geography into the database. Unanimous
  neighbours scored 90.5% and shipped as `adjacency`.

---

## What is open

### Needs a human decision — ~81 yes/no calls that would close the review queue

| Item | Count | The question |
|---|---|---|
| `iraq_location_reviews` pairs | 49 | Same place twice, or two places? e.g. `حي الخضراء` vs `منطقة الخضراء` — Hayy al-Khadra vs the Green Zone |
| `اخرى` placeholder rows | 18 | Keep as delivery destinations or drop? A merchant picking a dropdown fallback, not a place |
| Coin-flip placements | 14 | Each names both rivals: `خبات / سهل أربيل`, `الشيخان / بردرش`, `الرميثة / السماوة`, … |

```sql
select a.a_location_id, la.name_ar, b.b_location_id, lb.name_ar, a.reason
  from iraq_location_reviews a
  join iraq_locations la on la.id = a.a_location_id
  join iraq_locations lb on lb.id = a.b_location_id
 where not a.resolved;

select name_ar, review_reason from iraq_locations
 where review_reason like 'Two districts match%' or review_reason like 'Placeholder%';
```

### Needs research — 1,879 unplaced, yield now low

| Governorate | Placed | Unplaced areas | Assessment |
|---|---|---|---|
| Erbil | 28% | 214 | **Hard.** Gap is private compounds and towers (`لانه ستي`, `مارينا 1/2/3`, `شقق كامراني`). No public source lists them; block inference fails |
| Sulaymaniyah | 34% | 133 | Table already used, only +15. Kurdish spellings diverge from the catalogue — would need transliteration matching |
| Mosul | 55% | 130 | 142-quarter table already in. Remainder is the long tail |
| Karbala | 27% | 122 | Wikipedia table already in. Rest is small/rural |
| Maysan | 28% | 107 | **No quarter table found.** Needs a non-Wikipedia source |
| Kirkuk | 27% | 81 | **No quarter table found.** Same |

Also open: 70 landmarks with no published parent (churches, `سوق النفله`, `فلكة صباح الخياط`),
45 small rural names in no source consulted, 32 bracket-placed rows at 84.7% confidence.

### The resolver is at its ceiling

84.4% raw; of the 722 that do not resolve, **163 name no area at all** — the bare governorate the
caller already supplies, a landmark relative to nothing (`قرب دائره الكهرباء`), a street only, or
junk. Against the answerable subset it is **87.5%**. The remaining 559 are genuinely unknown
places, 447 distinct texts with almost no repetition. The gap is missing place *data*, not weaker
matching. Two things would need a new subsystem rather than a better rule: a street gazetteer,
and Arabic↔Latin transliteration for merchants who type `zayouna` / `eskan` / `shorsh`.

### Deliberately deferred by Ali — do not start these

`orders.region_id` wiring · all metrics work · monitoring · app pages · carrier abstraction.
Also: **no geocoding** (asked for and declined).

---

## Also worth knowing

- `apps/platform/lib/waseet-api.ts` has `syncLocationCatalog()`, and
  `apps/platform/app/api/cron/waseet-locations/route.ts` runs it weekly (Mon 03:00 via
  `apps/platform/vercel.json`). It hard-fails when `CRON_SECRET` is unset rather than
  silently disabling itself.
- Two migrations are deliberately unregistered data loaders —
  `20260916235600_iraq_postal_codes_data.sql` (348 codes) and
  `20260917012000_waseet_baghdad_gazetteer.sql` (204 rows). Both went into the live database via
  bare `execute_sql` and never as migrations. Their timestamps were chosen for **rebuild
  correctness**, not to replay history: the gazetteer must load before
  `20260917015534_iraq_locations_owned_schema.sql`, because the seed derives its sourced qadhas
  from `waseet_gazetteer`. Loaded any later, a rebuild produces only derived clusters and almost
  nothing placed. Both are idempotent and carry a header note saying so — don't "fix" them back.
- An artifact UI exists at `https://claude.ai/artifact/PyuyusXKaBYgFPQfUaQStX` ("Iraq Locations
  Database"), reading the `iraq_*` model live.
