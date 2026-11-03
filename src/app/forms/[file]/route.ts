import { scriptResponse } from "@/lib/forms/script";

// /forms/v1.<hash>.js: the build's own copy of the form script, cached for good (src/lib/forms/script.ts).

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  return scriptResponse((await params).file);
}
