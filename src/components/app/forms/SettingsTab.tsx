"use client";

// The Settings tab (docs/form-studio.md Part 3): what happens after the submit (a message, a page or a meeting), where
// leads go, consent and spam.

import type { Op } from "@/lib/forms/ops";
import type { Form } from "@/lib/forms/schema";
import { Panel, type ViewProps } from "../ui";
import { FormDestinations } from "./FormDestinations";
import { FormSettings } from "./FormSettings";
import type { Brand } from "./Preview";
import type { Destination, SourceRow } from "./shared";

export type SettingsTabProps = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & {
  form: Form;
  apply: (op: Op) => void;
  formId: string;
  dests: Destination[];
  sources: SourceRow[];
  reload: () => void;
  brand: Brand;
};

export function SettingsTab({ form, apply, sb, session, ws, role, navigate, formId, dests, sources, reload }: SettingsTabProps) {
  return (
    <div className="h-full overflow-auto bg-paper p-4 md:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <FormDestinations sb={sb} session={session} ws={ws} formId={formId} list={dests} sources={sources} reload={reload} navigate={navigate} />
        <Panel>
          <div className="p-5">
            <FormSettings form={form} apply={apply} sb={sb} ws={ws} session={session} role={role} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
