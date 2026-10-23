import { APP_URL } from "@/lib/site";
import { copyTimes, freeStarts } from "../_lib/host";
import { handle } from "../_lib/route";

// Free times (docs/meetings-scheduler.md 1.8b). POST { workspaceId, typeId, length?, tz?, hour12? } returns the
// type's next free times as text lines for an email ("Copy times"), each with a link that opens its booking page at
// that time. With { pick: true } it returns the starts themselves, for one-off meetings and polls; without a type,
// the caller's own free times for `length`.
export function POST(request: Request) {
  const origin = request.headers.get("origin");
  return handle(request, ({ rpc, actor, body }) =>
    body.pick === true
      ? freeStarts(rpc, actor, { type: body.typeId, length: body.length })
      : copyTimes(rpc, actor, { type: body.typeId, length: body.length, tz: body.tz, hour12: body.hour12 === true, origin: origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : APP_URL }),
  );
}
