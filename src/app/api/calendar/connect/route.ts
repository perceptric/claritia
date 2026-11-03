import { appBase } from "@/lib/billing";
import { startConnect } from "@/lib/meetings/providers/connect";
import { asCaller } from "../_lib/caller";

// Connect a calendar: POST { workspaceId, provider: "google" | "microsoft" | "zoom" } returns the sign-in link.
// (The local stack's "fake" provider connects at once and returns the account id.)

export const POST = (request: Request) => asCaller(request, (rpc, c, body) => startConnect(rpc, c, String(body.provider ?? ""), `${appBase()}/api/calendar/callback`));
