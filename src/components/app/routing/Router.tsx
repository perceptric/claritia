"use client";

// The Router tab: loads the router once (docs/router-ux.md 7.3 `load`), then shows the first screen until there's a
// router, the editor, or one past version read-only (/routing/versions/<n>). A failed reload keeps what's on screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorNote, errorText, type ViewProps } from "../ui";
import { routingApi, type Loaded } from "./api";
import { RouterEditor } from "./Editor";
import { FirstScreen } from "./FirstScreen";
import { FlowSkeleton } from "./Flow";
import { VersionView } from "./Versions";

export function RouterTab(props: Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { version: number | null }) {
  const { session, ws, role, version } = props;
  const [state, setState] = useState<{ data: Loaded; epoch: number } | null>(null);
  const [error, setError] = useState("");
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  /** Load again; `remount` starts the editor over from what's saved (after publish, roll back or start over). */
  const refresh = useCallback(
    async (remount: boolean) => {
      try {
        const data = await routingApi<Loaded>(sessionRef.current, ws.id, "load");
        setState((s) => ({ data, epoch: (s?.epoch ?? 0) + (remount ? 1 : 0) }));
        setError("");
      } catch (e) {
        setError(errorText(e));
      }
    },
    [ws.id],
  );
  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const errorBar = error ? (
    <div className="flex items-center gap-2 px-4 pt-3 md:px-6">
      <div className="flex-1">
        <ErrorNote message={error} />
      </div>
      <Button variant="ghost" size="sm" onClick={() => void refresh(false)}>
        Try again
      </Button>
    </div>
  ) : null;

  if (!state)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {errorBar}
        {error ? null : (
          <>
            <div className="h-14 shrink-0 border-b border-line" />
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
              <FlowSkeleton />
              <div className="hidden border-l border-line lg:block" />
            </div>
          </>
        )}
      </div>
    );

  const d = state.data;
  const body =
    version !== null ? (
      <VersionView {...props} version={version} data={d} onRolledBack={() => void refresh(true)} />
    ) : !d.live && !d.draft ? (
      <div className="h-full overflow-y-auto">
        <FirstScreen session={session} ws={ws.id} data={d} canEdit={role === "owner"} onCreated={() => void refresh(true)} />
      </div>
    ) : (
      <RouterEditor key={state.epoch} {...props} data={d} refresh={refresh} />
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {errorBar}
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}
