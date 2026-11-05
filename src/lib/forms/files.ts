// File uploads on forms (docs/forms-plan.md 3.1): what a file is, read from its bytes and never from its name alone.
// A PDF, a picture (PNG, JPEG, GIF, WebP), an Office file (Word, Excel, PowerPoint, old or new), a recording or a
// sound or video file. Anything else is
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
  // Recordings and media (docs/fields-plan.md Part 3): WebM, MP4, Ogg, MP3 and WAV, read from their bytes. WebM and
  // MP4 hold sound or film: a name like audio-1.webm or .m4a says sound.
  const sound = /^audio|\.(weba|m4a|mp3|wav|ogg|oga)$/i.test(name);
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return sound ? { kind: "audio", type: "audio/webm" } : { kind: "video", type: "video/webm" };
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return sound ? { kind: "audio", type: "audio/mp4" } : { kind: "video", type: "video/mp4" };
  if (starts(b, [0x4f, 0x67, 0x67, 0x53])) return { kind: "audio", type: "audio/ogg" };
  if (starts(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return { kind: "audio", type: "audio/mpeg" };
  if (starts(b, [0x52, 0x49, 0x46, 0x46]) && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) return { kind: "audio", type: "audio/wav" };
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
