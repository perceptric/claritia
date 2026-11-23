/** A JSON error answer for an API route: { error } with a 400 unless another status is given. */
export const bad = (error: string, status = 400) => Response.json({ error }, { status });
