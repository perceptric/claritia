// Keys from labels, for the template gallery's builders.

/** A field key from its label: "Team size" → team_size, unique among `taken`. */
export function keyFrom(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/['’]/g, "")
      .replace(/[^\w\s]/g, " ")
      .trim()
      .split(/[\s_]+/)
      .filter(Boolean)
      .slice(0, 5)
      .join("_")
      .replace(/^[^a-z]+/, "")
      .slice(0, 36) || "field";
  let k = base;
  for (let n = 2; taken.has(k); n++) k = `${base.slice(0, 36)}_${n}`;
  taken.add(k);
  return k;
}
