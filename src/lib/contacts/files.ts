// Reading an import file as rows, whatever it is: CSV, TSV or TXT (any encoding), Excel .xlsx, or vCard. Rows
// stream, so a file of any size reads in steady memory. Server only (the web app's routes and claritia-intel).

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { unzipSync, strFromU8 } from "fflate";
import { CsvReader, csvRows, sniffEncoding } from "./csv.ts";
import { VCARD_HEADER, vcardRows } from "./vcard.ts";

export type FileKind = "csv" | "xlsx" | "vcf";

export function kindOf(name: string): FileKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["csv", "tsv", "txt", "tab"].includes(ext)) return "csv";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "vcf" || ext === "vcard") return "vcf";
  return null;
}

/** A spreadsheet cell as text: dates as dates, formulas as their result, rich text and links as their text. */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return cellText(o.text);
    if ("error" in o) return "";
    return "";
  }
  return String(v);
}

/** Sheet names in an .xlsx, from its workbook part. */
export function xlsxSheets(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes, { filter: (f) => f.name === "xl/workbook.xml" });
  const xml = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  return [...xml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
  );
}

/** Shared strings an .xlsx may hold before it's refused (they're kept in memory while the sheet is read). */
export const XLSX_MAX_STRINGS = 2_000_000;
export const XLSX_MAX_CHARS = 200_000_000;
export const XLSX_TOO_BIG = "This spreadsheet is too big to read. Save it as CSV and try again.";

/** An array that refuses to grow past the caps: ExcelJS keeps every shared string of the workbook in one. */
function cappedStrings(maxItems: number, maxChars: number): unknown[] {
  const arr: unknown[] = [];
  let chars = 0;
  arr.push = (...items: unknown[]) => {
    for (const it of items) {
      chars += typeof it === "string" ? it.length : JSON.stringify(it ?? "").length;
      if (arr.length >= maxItems || chars > maxChars) throw new Error(XLSX_TOO_BIG);
      Array.prototype.push.call(arr, it);
    }
    return arr.length;
  };
  return arr;
}

async function* xlsxRows(bytes: AsyncIterable<Uint8Array>, sheet?: string | null, caps = { strings: XLSX_MAX_STRINGS, chars: XLSX_MAX_CHARS }): AsyncGenerator<string[]> {
  // Styles are read so date cells come back as dates.
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(bytes), { worksheets: "emit", sharedStrings: "cache", hyperlinks: "ignore", styles: "cache", entries: "ignore" });
  // The shared strings are cached in memory for the cells that point at them: refuse a workbook past the caps
  // instead of running the worker out of memory.
  let strings: unknown[] | undefined;
  Object.defineProperty(reader, "sharedStrings", {
    configurable: true,
    get: () => strings,
    set: (v: unknown[] | undefined) => {
      strings = Array.isArray(v) ? cappedStrings(caps.strings, caps.chars) : v;
    },
  });
  let first = true;
  for await (const ws of reader) {
    const name = (ws as unknown as { name?: string }).name;
    const take = sheet ? name === sheet : first;
    first = false;
    if (!take) {
      for await (const row of ws) void row;
      continue;
    }
    let width = 0;
    let header: string[] | null = null;
    for await (const row of ws) {
      const values = (row as unknown as { values: unknown[] }).values ?? [];
      // Row values start at index 1.
      const cells = Array.from({ length: Math.max(values.length - 1, width) }, (_, i) => cellText(values[i + 1]).trim());
      if (!header) {
        // Merged or blank header cells take the one before them, so every column has a name.
        header = cells.map((c, i) => c || (i > 0 ? `${cells[i - 1] || `Column ${i}`} ${i + 1}` : `Column ${i + 1}`));
        width = header.length;
        yield header;
        continue;
      }
      if (cells.some((c) => c !== "")) yield cells.slice(0, Math.max(width, cells.length));
    }
    return;
  }
}

async function* vcfRows(bytes: AsyncIterable<Uint8Array>): AsyncGenerator<string[]> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of bytes) {
    text += decoder.decode(chunk, { stream: true });
    // Emit finished cards as they come.
    const end = text.lastIndexOf("END:VCARD");
    if (end >= 0) {
      const cut = end + "END:VCARD".length;
      const rows = vcardRows(text.slice(0, cut));
      text = text.slice(cut);
      if (rows.length) yield* rows;
    }
  }
  text += decoder.decode();
  yield* vcardRows(text);
}

/** Rows of a file, header first. */
export async function* fileRows(kind: FileKind, bytes: AsyncIterable<Uint8Array>, sheet?: string | null, caps?: { strings: number; chars: number }): AsyncGenerator<string[]> {
  if (kind === "xlsx") yield* xlsxRows(bytes, sheet, caps);
  else if (kind === "vcf") {
    yield VCARD_HEADER;
    yield* vcfRows(bytes);
  } else yield* csvRows(bytes);
}

export type Inspection = { header: string[]; samples: string[][]; rows: number; done: boolean; sheets: string[] };

/** The header, the first rows, and a row count (exact when the file was read to the end within the limit). */
export async function inspect(kind: FileKind, bytes: AsyncIterable<Uint8Array>, opts: { sheet?: string | null; sheets?: string[]; samples?: number; countUpTo?: number } = {}): Promise<Inspection> {
  const want = opts.samples ?? 20;
  const limit = opts.countUpTo ?? 200_000;
  let header: string[] = [];
  const samples: string[][] = [];
  let rows = 0;
  let done = true;
  for await (const r of fileRows(kind, bytes, opts.sheet)) {
    if (!header.length) {
      header = r;
      continue;
    }
    rows++;
    if (samples.length < want) samples.push(r);
    if (rows >= limit) {
      done = false;
      break;
    }
  }
  return { header, samples, rows, done, sheets: opts.sheets ?? [] };
}

/** Bytes as an async iterable, from a web stream, a Blob or a buffer. */
export async function* chunksOf(src: ReadableStream<Uint8Array> | Blob | Uint8Array): AsyncGenerator<Uint8Array> {
  if (src instanceof Uint8Array) {
    for (let i = 0; i < src.length; i += 1 << 20) yield src.subarray(i, i + (1 << 20));
    return;
  }
  const stream = src instanceof Blob ? src.stream() : src;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value?.length) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// Resuming a CSV ------------------------------------------------------------------------------------------------

type Encoding = ReturnType<typeof sniffEncoding>;

/** Where a CSV import can pick up again: the byte after a finished row, the file's encoding and its header line. */
export type CsvResume = { offset: number; encoding: Encoding; head: string };

/**
 * Follows csvRowsAt as it reads. After each row it yields, `offset` is the byte just after that row when the row
 * ended a line cleanly (null when it didn't: a cell with a line break split over a cut, an old Mac line end), and
 * `resume()` gives what a later read needs to start there.
 */
export type CsvCursor = { offset: number | null; encoding: Encoding | null; head: string | null; resume: () => CsvResume | null };

export const csvCursor = (): CsvCursor => {
  const c: CsvCursor = {
    offset: null,
    encoding: null,
    head: null,
    resume: () => (c.offset !== null && c.encoding && c.head !== null ? { offset: c.offset, encoding: c.encoding, head: c.head } : null),
  };
  return c;
};

const LONG_LINE = 1 << 20;

/**
 * CSV rows from a byte stream, header first, the same as csvRows, keeping `cur` up to date. With `from`, the bytes
 * start at `from.offset` of the file: the saved header line is read first, then the rows from there on.
 */
export async function* csvRowsAt(bytes: AsyncIterable<Uint8Array>, cur: CsvCursor, from?: CsvResume): AsyncGenerator<string[]> {
  const reader = new CsvReader();
  let decoder: TextDecoder | null = null;
  let enc: Encoding | null = null;
  // The file offset of the first byte in `carry`.
  let pos = from ? from.offset : 0;
  let carry = new Uint8Array(0);
  let clean = true;
  let head: string | null = from ? from.head : "";
  let headerOut = false;

  const start = (e: Encoding) => {
    enc = e;
    cur.encoding = e;
    decoder = new TextDecoder(e);
  };

  /** Push one piece of text; `end` is the file offset after it when it closes a line, else null. */
  function* emit(text: string, end: number | null): Generator<string[]> {
    if (!headerOut && head !== null) {
      head = head.length + text.length <= LONG_LINE ? head + text : null;
    }
    const rows = reader.push(text);
    if (rows.length && !headerOut) {
      headerOut = true;
      cur.head = head;
    }
    const body = text.replace(/\r?\n$/, "");
    const tidy = end !== null && clean && !body.includes("\r");
    for (const [i, r] of rows.entries()) {
      cur.offset = i === rows.length - 1 && tidy ? end : null;
      yield r;
    }
  }

  /** Where the next line ends in `buf` from `at` (the index after its newline), or -1. */
  const lineEnd = (buf: Uint8Array, at: number): number => {
    for (let i = buf.indexOf(0x0a, at); i >= 0; i = buf.indexOf(0x0a, i + 1)) {
      if (enc === "utf-16le") {
        if ((pos + i) % 2 === 0 && buf[i + 1] === 0) return i + 2;
        if (i + 1 >= buf.length && (pos + i) % 2 === 0) return -1;
      } else if (enc === "utf-16be") {
        if ((pos + i) % 2 === 1 && buf[i - 1] === 0) return i + 1;
      } else return i + 1;
    }
    return -1;
  };

  function* lines(chunk: Uint8Array, last: boolean): Generator<string[]> {
    let buf = chunk;
    if (carry.length) {
      buf = new Uint8Array(carry.length + chunk.length);
      buf.set(carry);
      buf.set(chunk, carry.length);
    }
    let at = 0;
    for (let e = lineEnd(buf, at); e >= 0; e = lineEnd(buf, at)) {
      yield* emit(decoder!.decode(buf.subarray(at, e), { stream: true }), pos + e);
      clean = true;
      at = e;
    }
    pos += at;
    carry = buf.slice(at);
    if (!last && carry.length > LONG_LINE) {
      // A line this long (or a file of old Mac line ends) is read on without places to resume.
      clean = false;
      yield* emit(decoder!.decode(carry, { stream: true }), null);
      pos += carry.length;
      carry = new Uint8Array(0);
    }
  }

  if (from) {
    start(from.encoding);
    cur.head = from.head;
    headerOut = true;
    yield* reader.push(from.head);
  }
  let pending = new Uint8Array(0);
  for await (const chunk of bytes) {
    if (!enc) {
      const joined = new Uint8Array(pending.length + chunk.length);
      joined.set(pending);
      joined.set(chunk, pending.length);
      if (joined.length < 65536) {
        pending = joined;
        continue;
      }
      start(sniffEncoding(joined.subarray(0, 65536)));
      pending = new Uint8Array(0);
      yield* lines(joined, false);
      continue;
    }
    yield* lines(chunk, false);
  }
  if (!enc) {
    start(sniffEncoding(pending.subarray(0, 65536)));
    yield* lines(pending, true);
  }
  clean = false;
  yield* emit(decoder!.decode(carry) + decoder!.decode(), null);
  for (const r of reader.end()) {
    cur.offset = null;
    yield r;
  }
}
