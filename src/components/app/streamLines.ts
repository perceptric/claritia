// Reads a stream of JSON lines (/api/studio's answers), one line at a time. A failed request throws its error.

export async function readLines<L>(res: Response, onLine: (l: L) => void): Promise<void> {
  if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    let at: number;
    while ((at = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, at).trim();
      buf = buf.slice(at + 1);
      if (raw) onLine(JSON.parse(raw) as L);
    }
    if (done) break;
  }
}
