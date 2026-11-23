/** s cut to n characters, with an ellipsis when it was longer. */
export const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
