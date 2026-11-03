import type { Rpc } from "@/lib/jobs";
import { handleHook } from "@/lib/meetings/providers/hook";
import { serviceClient } from "@/lib/serviceClient";

// Push notifications from Google Calendar and Microsoft Graph (src/lib/meetings/providers/hook.ts).

export async function POST(request: Request) {
  const db = serviceClient();
  if (!db) return new Response(null, { status: 500 });
  const rpc: Rpc = (f, args) => db.rpc(f, args);
  return handleHook(request, rpc);
}
