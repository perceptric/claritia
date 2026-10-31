// A meeting type as the forms screens name it.

/** A meeting type's name with its first length: "Audit walkthrough, 30 min". */
export const typeLabel = (
  t: { name: string; settings?: { lengths?: number[] } } | undefined | null,
) =>
  t
    ? `${t.name}${t.settings?.lengths?.[0] ? `, ${t.settings.lengths[0]} min` : ""}`
    : "A meeting";
