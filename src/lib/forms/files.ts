// File uploads on forms (docs/forms-plan.md 3.1): what a file is, read from its bytes and never from its name alone.
// A PDF, a picture (PNG, JPEG, GIF, WebP) or an Office file (Word, Excel, PowerPoint, old or new). Anything else is
// refused, so a renamed script can't ride in as a "document".

import { sniffImage } from "../design/assets.ts";
import type { FileKind } from "./schema.ts";

const starts = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
const OFFICE = /\.(docx|xlsx|pptx|doc|xls|ppt)$/i;
const TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
};

/** The file's kind and media type, or null when it isn't one a form takes. */
export function sniffFile(b: Uint8Array, name: string): { kind: FileKind; type: string } | null {
  if (starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "pdf", type: "application/pdf" };
  const img = sniffImage(b);
  if (img) return { kind: "image", type: img.type };
  const ext = OFFICE.exec(name)?.[1]?.toLowerCase();
  if (!ext) return null;
  // New Office files are zips; old ones are compound documents.
  const zip = starts(b, [0x50, 0x4b, 0x03, 0x04]);
  const ole = starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if ((ext.endsWith("x") && zip) || (!ext.endsWith("x") && ole)) return { kind: "office", type: TYPES[ext]! };
  return null;
}

/** A name safe to keep and show: no paths, no line breaks, at most 120 characters. */
export const cleanName = (name: string) => name.replace(/^.*[\\/]/, "").replace(/[\r\n\t]/g, " ").replace(/[^\w .()-]/g, "").trim().slice(0, 120) || "file";

/** The upload ids in a fill's answers (file answers are "up_<id>:<name>"). */
export const uploadIds = (values: unknown[]): string[] => values.flatMap((v) => (typeof v === "string" && v.startsWith("up_") ? [v.slice(3, 39)] : []));
