// Where a filler is decides which consent rules apply: strict (opt-in, as in the EU, UK and similar), notice or
// off. Unknown places are treated as strict, so a missing geo lookup can only make Claritia ask for more consent.

export type Region = "strict" | "notice" | "off";
export type Overrides = { strict?: string[]; off?: string[] };

// EU, EEA, UK and Switzerland. Brazil's LGPD is treated the same (check).
const STRICT = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH BR".split(" "),
);
const STRICT_SUBDIVISIONS = new Set(["CA-QC"]);

/** `country` is ISO 3166-1 alpha-2, `subdivision` the ISO 3166-2 part after the dash (QC, CA). */
export function regionOf(country: string, subdivision: string, overrides: Overrides = {}): Region {
  const c = (country || "").toUpperCase();
  const cs = c && subdivision ? `${c}-${subdivision.toUpperCase()}` : "";
  const has = (list?: string[]) => !!list?.some((x) => x.toUpperCase() === c || (cs && x.toUpperCase() === cs));
  if (has(overrides.off)) return "off";
  // Canada without a province could be Quebec.
  if (!c || STRICT.has(c) || STRICT_SUBDIVISIONS.has(cs) || (c === "CA" && !subdivision) || has(overrides.strict)) return "strict";
  return "notice";
}

