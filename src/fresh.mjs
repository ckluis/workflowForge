// Freshness: how old a document is, and whether its author's review interval
// has run out. See spec/DSL.md §1 (`meta.date`, `meta.reviewEvery`).
//
// Nothing in here reads a clock. Every function that needs "now" is handed it,
// as a `YYYY-MM-DD` string, by its caller. That is deliberate and load-bearing:
//
//   * the build must be byte-identical across runs, so no build-time module may
//     ask what day it is — a stamped date would make the determinism check fail
//     across a midnight boundary and pass either side of it, the worst kind of
//     flake;
//   * the age of a document is a fact about the moment it is *read*, not the
//     moment it was built, and the reader's own clock is the only time source a
//     single file with no network can have;
//   * a test that reads the real clock rots. These take their `today` as an
//     argument, so the fixtures stay true forever.
//
// The only clock call in the project is in `assets/app.js`, at read time.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EVERY_RE = /^(\d{1,3}) (day|days|week|weeks|month|months|year|years)$/;

const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Intl is not used anywhere here: its output varies with the host's ICU. */
export function formatDay(day) {
  if (!day) return "";
  return `${day.d} ${MONTH_NAME[day.m - 1]} ${day.y}`;
}

export function isoDay(day) {
  const p = (n, w) => String(n).padStart(w, "0");
  return `${p(day.y, 4)}-${p(day.m, 2)}-${p(day.d, 2)}`;
}

function leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

function daysInMonth(y, m) {
  return [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Days since 1970-01-01, by Howard Hinnant's civil-calendar algorithm. */
export function dayNumber(day) {
  let y = day.y - (day.m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = day.m + (day.m > 2 ? -3 : 9);
  const doy = Math.floor((153 * mp + 2) / 5) + day.d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse of `dayNumber`. */
export function dayFromNumber(z) {
  const n = z + 719468;
  const era = Math.floor(n / 146097);
  const doe = n - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

/** `"2026-03-04"` -> `{ y, m, d }`; anything else -> null. Calendar-checked. */
export function parseDay(iso) {
  if (typeof iso !== "string") return null;
  const m = DATE_RE.exec(iso.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

/**
 * `"6 months"` -> `{ n: 6, unit: "month", label: "6 months" }`; anything else
 * -> null. Authors think in intervals ("review this every six months"), so an
 * interval is what the field takes.
 */
export function parseReviewEvery(value) {
  if (typeof value !== "string") return null;
  const m = EVERY_RE.exec(value.trim());
  if (!m) return null;
  const n = +m[1];
  if (n < 1) return null;
  const unit = m[2].replace(/s$/, "");
  return { n, unit, label: `${n} ${unit}${n === 1 ? "" : "s"}` };
}

/** Calendar addition. Month and year arithmetic clamps to the month's length. */
export function addInterval(day, n, unit) {
  if (unit === "day") return dayFromNumber(dayNumber(day) + n);
  if (unit === "week") return dayFromNumber(dayNumber(day) + n * 7);
  const months = unit === "year" ? n * 12 : n;
  const total = (day.y * 12 + (day.m - 1)) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(day.d, daysInMonth(y, m)) };
}

/** A span of days as a phrase a reader can hold in their head. */
export function describeSpan(days) {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 45) return `${days} days`;
  if (days < 730) {
    const months = Math.max(2, Math.round(days / 30.44));
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const years = Math.floor(days / 365.25);
  const rest = Math.round((days - years * 365.25) / 30.44);
  const y = `${years} year${years === 1 ? "" : "s"}`;
  return rest >= 1 && rest <= 11 ? `${y} ${rest} month${rest === 1 ? "" : "s"}` : y;
}

/**
 * What the page can say about itself at build time — no clock involved, so it
 * survives the byte-identical check and is what a reader with scripting off
 * sees. The age is added over the top of this, at read time, by app.js.
 */
export function staticLine(meta) {
  const day = parseDay(meta && meta.date);
  if (!day) return null;
  const every = parseReviewEvery(meta && meta.reviewEvery);
  return `Dated ${formatDay(day)}` + (every ? ` · reviewed every ${every.label}` : "");
}

/**
 * The read-time answer. `today` is a `YYYY-MM-DD` string supplied by the caller.
 *
 * Returns null when there is no usable `meta.date` — most documents will not
 * have one, and a document that does not claim a date is not making a claim
 * that can go stale. No date, no signal, no nag.
 */
export function freshness(meta, today) {
  const day = parseDay(meta && meta.date);
  const now = parseDay(today);
  if (!day || !now) return null;

  const ageDays = dayNumber(now) - dayNumber(day);
  const every = parseReviewEvery(meta && meta.reviewEvery);
  const dated = `dated ${formatDay(day)}`;

  // A date in the future is a typo or a document written ahead of its own
  // publication. Neither is staleness, so state the date and stop.
  if (ageDays < 0) {
    const only = `Dated ${formatDay(day)}`;
    return { state: "fresh", ageDays, age: null, due: null, dueDays: null,
      review: every ? every.label : null, lead: null, body: only, text: only };
  }

  const age = describeSpan(ageDays);
  const agePart = ageDays === 0 ? "written today" : `${age} old`;

  if (!every) {
    const line = `Dated ${formatDay(day)} · ${agePart}`;
    return { state: "fresh", ageDays, age, due: null, dueDays: null, review: null,
      lead: null, body: line, text: line };
  }

  const dueDay = addInterval(day, every.n, every.unit);
  const dueDays = dayNumber(dueDay) - dayNumber(now);   // negative once overdue
  const due = isoDay(dueDay);

  if (dueDays > 0) {
    // The interval as well as the date. It used to print only "review due 4
    // March", which tells a reader when the next one lands but never how often
    // this document expects to be checked — and the cadence is the fact a
    // process owner is actually governing against.
    const line = `Dated ${formatDay(day)} · ${agePart} · reviewed every ${every.label} · ` +
      `next due ${formatDay(dueDay)}`;
    return { state: "fresh", ageDays, age, due, dueDays, review: every.label,
      lead: null, body: line, text: line };
  }
  // `lead` is the half the reader must not miss, and is what app.js emboldens.
  const lead = dueDays === 0 ? "Due for review today" : "Overdue for review";
  const body = dueDays === 0
    ? `${dated}, ${agePart} · the review interval is ${every.label}`
    : `${dated}, ${agePart} · a review was due ${formatDay(dueDay)}, ` +
      `${describeSpan(-dueDays)} ago`;
  return { state: "stale", ageDays, age, due, dueDays, review: every.label,
    lead, body, text: `${lead} · ${body}` };
}

/**
 * Validation for the two `meta` fields freshness rests on. Returned in the same
 * shape the rest of the validator uses.
 *
 * A malformed `date` is a warning, not an error: it is prose today (an eyebrow
 * and a fact-strip chip) and refusing to build a whole document over it would
 * be out of proportion. A malformed `reviewEvery` *is* an error — the author
 * asked for a signal that cannot be computed, and silently dropping it would
 * leave them believing the page warns when it does not.
 */
/**
 * `meta.review` — who checked this document, when, and how much of it.
 *
 * Written by "Publish review" in app.js, never by the build: it is a claim about
 * a human act, and the same rule that governs `step.verification` governs it —
 * only a human may write it, and a malformed one is an error rather than a
 * silently-dropped field. A document that *looks* reviewed because a broken
 * provenance block was ignored is the exact failure this format exists to
 * prevent.
 *
 * `on` is a read-time date, so it is stamped in the reader's browser at publish
 * time. That does not break the build's determinism rule: nothing here asks what
 * day it is, the field is only ever read back.
 */
export function checkReview(meta) {
  const errors = [];
  const warnings = [];
  const r = meta && meta.review;
  if (r == null) return { errors, warnings };

  if (typeof r !== "object" || Array.isArray(r)) {
    errors.push({
      path: "meta.review",
      message: `meta.review must be an object, got ${Array.isArray(r) ? "array" : typeof r}`,
      hint: 'written by "Publish review": { "by": "name", "on": "YYYY-MM-DD", ' +
        '"verified": 4, "disputed": 1, "total": 16 }',
    });
    return { errors, warnings };
  }

  if (typeof r.by !== "string" || !r.by.trim()) {
    errors.push({
      path: "meta.review.by",
      message: "meta.review.by is missing or empty",
      hint: "a review with nobody's name on it is not attributable, which is the " +
        "only thing a review record is for. Name the person who checked it.",
    });
  }

  if (!parseDay(r.on)) {
    errors.push({
      path: "meta.review.on",
      message: `meta.review.on ${JSON.stringify(r.on)} is not a YYYY-MM-DD calendar date`,
      hint: "the day the review was published, so a reader can tell how old the " +
        "check is as well as who made it",
    });
  }

  for (const k of ["verified", "disputed", "total"]) {
    const v = r[k];
    if (!Number.isInteger(v) || v < 0) {
      errors.push({
        path: `meta.review.${k}`,
        message: `meta.review.${k} must be a whole number of steps, got ${JSON.stringify(v)}`,
      });
    }
  }

  // Counts that do not add up would let a document overstate its own review,
  // which is worse than carrying no record at all.
  if (Number.isInteger(r.verified) && Number.isInteger(r.disputed) && Number.isInteger(r.total)
      && r.verified + r.disputed > r.total) {
    errors.push({
      path: "meta.review",
      message: `meta.review claims ${r.verified} verified + ${r.disputed} disputed ` +
        `in a document of ${r.total} steps`,
      hint: "the counts must not exceed the total; this record would overstate the review",
    });
  }

  return { errors, warnings };
}

export function checkMeta(meta) {
  const errors = [];
  const warnings = [];
  if (!meta || typeof meta !== "object") return { errors, warnings };

  if (meta.date != null && !parseDay(meta.date)) {
    warnings.push({
      path: "meta.date",
      message: `meta.date ${JSON.stringify(meta.date)} is not a YYYY-MM-DD calendar date, ` +
        "so the page can say nothing about how old this document is",
    });
  }

  if (meta.reviewEvery == null) return { errors, warnings };

  if (typeof meta.reviewEvery !== "string") {
    errors.push({
      path: "meta.reviewEvery",
      message: `meta.reviewEvery must be a string, got ${typeof meta.reviewEvery}`,
      hint: 'an interval, a whole number and a unit: "90 days", "6 months", "1 year"',
    });
    return { errors, warnings };
  }
  if (!parseReviewEvery(meta.reviewEvery)) {
    errors.push({
      path: "meta.reviewEvery",
      message: `meta.reviewEvery ${JSON.stringify(meta.reviewEvery)} is not a review interval`,
      hint: 'write a whole number of days, weeks, months or years: "90 days", ' +
        '"6 months", "1 year". Not a date, not "biannual", not 6.',
    });
    return { errors, warnings };
  }
  if (!parseDay(meta.date)) {
    errors.push({
      path: "meta.reviewEvery",
      message: "meta.reviewEvery has nothing to measure from: meta.date is " +
        (meta.date == null ? "missing" : `not a YYYY-MM-DD calendar date`),
      hint: "set meta.date to the day the material was last checked, or drop " +
        "meta.reviewEvery — an interval on its own cannot say anything.",
    });
  }
  return { errors, warnings };
}
