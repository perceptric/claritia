"use client";

// One email group on a canvas (docs/email-studio-plan.md, the Brew comparison, step 3): the group's emails side by
// side, in order, each as it would arrive in the workspace's brand. Opening one opens the Email Studio (Done comes
// back here); each can move left or right or leave the group. Add email makes a new draft in the group or brings in
// one from Campaigns. Each email is still its own campaign, sent on its own.

import { useMemo, useState } from "react";
import { compileEmail } from "@/lib/design/email/compile";
import { newBlock, newSection, readEmailDoc } from "@/lib/design/email/doc";
import { readSystem, type DesignSystem } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import {
  ArrowLeft,
  ArrowRight,
  Monitor,
  Phone,
  Plus,
  Trash,
  X,
} from "../../Icons";
import { askConfirm, askText } from "../Dialogs";
import { Select } from "../Select";
import {
  Badge,
  Button,
  ErrorNote,
  errorText,
  IconButton,
  invalidate,
  Loading,
  must,
  Page,
  useQuery,
  type Tone,
  type ViewProps,
} from "../ui";

type Row = {
  id: string;
  name: string;
  subject: string;
  status: string;
  doc: unknown;
  html: string;
  group_position: number;
};
type Kit = { tokens: Tokens; logo?: string; system: DesignSystem };
const TONE: Record<string, Tone> = {
  sent: "green",
  sending: "amber",
  scheduled: "sky",
  draft: "gray",
};
const LABEL: Record<string, string> = {
  sent: "Sent",
  sending: "Sending",
  scheduled: "Scheduled",
  draft: "Draft",
};
/** Merge tags as a reader sees them: the fallback, or a sample address. */
const filled = (html: string) =>
  html.replace(
    /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g,
    (_m, k: string, f?: string) =>
      k === "company_address" ? "" : k === "unsubscribe_url" ? "#" : (f ?? ""),
  );

export function EmailGroup({
  sb,
  ws,
  navigate,
  groupId,
}: ViewProps & { groupId: string }) {
  const group = useQuery(
    `email_group:${groupId}`,
    async () =>
      must(
        await sb
          .from("email_groups")
          .select("id, name")
          .eq("id", groupId)
          .eq("workspace_id", ws.id)
          .maybeSingle(),
      ) as { id: string; name: string } | null,
    { staleMs: 0 },
  );
  const rows = useQuery(
    `email_group_rows:${groupId}`,
    async () =>
      (must(
        await sb
          .from("emails")
          .select("id, name, subject, status, doc, html, group_position")
          .eq("group_id", groupId)
          .eq("workspace_id", ws.id)
          .order("group_position"),
      ) ?? []) as Row[],
    { staleMs: 0 },
  );
  const loose = useQuery(
    `email_loose:${ws.id}`,
    async () =>
      (must(
        await sb
          .from("emails")
          .select("id, name")
          .eq("workspace_id", ws.id)
          .eq("kind", "broadcast")
          .is("group_id", null)
          .neq("status", "archived")
          .order("updated_at", { ascending: false })
          .limit(50),
      ) ?? []) as { id: string; name: string }[],
    { staleMs: 0 },
  );
  const kit = useQuery(`email_group_kit:${ws.id}`, async () => {
    const { data } = await sb
      .from("brand_kits")
      .select("tokens, logo_url, design")
      .eq("workspace_id", ws.id)
      .order("created_at")
      .limit(1);
    const k = (data?.[0] ?? null) as {
      tokens: Partial<Tokens>;
      logo_url: string | null;
      design: unknown;
    } | null;
    const tokens = cleanTokens(k?.tokens ?? {}).tokens;
    return {
      tokens,
      logo: k?.logo_url ?? undefined,
      system: readSystem(k?.design ?? {}, tokens),
    } as Kit;
  });
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const back = () => navigate("emails");
  const reload = () => {
    void rows.reload();
    void loose.reload();
    invalidate(`email_groups:${ws.id}`);
    invalidate(`email_campaigns:${ws.id}`);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const place = (id: string, group: string | null, pos: number | null) =>
    sb
      .rpc("email_group_place", {
        p_ws: ws.id,
        p_email: id,
        p_group: group,
        p_position: pos,
      })
      .then(must);
  const add = (v: string) =>
    run(async () => {
      if (v === "new") {
        const id = must(
          await sb.rpc("email_draft_save", {
            p_ws: ws.id,
            p_id: null,
            p_name: "Untitled email",
            p_subject: "",
            p_preheader: "",
            p_doc: {
              ...readEmailDoc({}),
              sections: [newSection([newBlock("footer")])],
            },
          }),
        ) as string;
        await place(id, groupId, null);
        reload();
        navigate("emails", `campaigns/${id}`);
        return;
      }
      await place(v, groupId, null);
      reload();
    });
  const rename = () =>
    run(async () => {
      const name = (
        await askText("Rename the group", {
          initial: group.data?.name ?? "",
          ok: "Save",
        })
      )?.trim();
      if (!name || name === group.data?.name) return;
      must(
        await sb.rpc("email_group_save", {
          p_ws: ws.id,
          p_id: groupId,
          p_name: name,
        }),
      );
      void group.reload();
      invalidate(`email_groups:${ws.id}`);
    });
  const remove = () =>
    run(async () => {
      if (
        !(await askConfirm(`Delete ${group.data?.name ?? "this group"}?`, {
          body: "Its emails stay in Campaigns.",
          ok: "Delete",
          danger: true,
        }))
      )
        return;
      must(await sb.rpc("email_group_delete", { p_ws: ws.id, p_id: groupId }));
      invalidate(`email_groups:${ws.id}`);
      back();
    });

  if (group.error || rows.error)
    return <ErrorNote message={group.error || rows.error} />;
  if (!group.loaded || !rows.data) return <Loading />;
  if (!group.data)
    return (
      <Page title="Campaigns" back={{ label: "Campaigns", onClick: back }}>
        <ErrorNote message="This group is gone." />
      </Page>
    );
  const list = rows.data;
  return (
    <Page
      title={group.data.name}
      count={list.length}
      back={{ label: "Campaigns", onClick: back }}
      actions={
        <span className="flex flex-wrap items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="Size"
            className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5"
          >
            {(
              [
                [false, "Desktop", <Monitor key="d" size={14} />],
                [true, "Phone", <Phone key="p" size={14} />],
              ] as const
            ).map(([v, label, icon]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={phone === v}
                aria-label={label}
                title={label}
                onClick={() => setPhone(v)}
                className={`flex size-7 items-center justify-center rounded-full transition-colors duration-[140ms] ${phone === v ? "bg-card text-ink shadow-chip" : "text-muted hover:text-ink"}`}
              >
                {icon}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => void rename()}>
            Rename
          </Button>
          <IconButton
            label={`Delete ${group.data.name}`}
            onClick={() => void remove()}
          >
            <Trash size={13} />
          </IconButton>
          <Select<string>
            ariaLabel="Add email"
            value=""
            placeholder="Add email"
            plainPlaceholder
            disabled={busy}
            align="right"
            menuWidth={240}
            onChange={(v) => void add(v)}
            options={[
              { value: "new", label: "New email" },
              ...(loose.data ?? []).map((e) => ({
                value: e.id,
                label: e.name,
                group: "From Campaigns",
              })),
            ]}
            className="h-8 rounded-full bg-brand px-3.5 text-[13px] font-medium text-on-brand hover:bg-brand-hover"
          />
        </span>
      }
    >
      <ErrorNote message={error} />
      <div className="overflow-x-auto rounded-xl bg-paper px-4 py-6 md:px-6">
        {list.length ? (
          <ol
            aria-label={`Emails in ${group.data.name}`}
            className="mx-auto flex w-max min-w-full items-start justify-center gap-6"
          >
            {list.map((r, i) => (
              <li
                key={r.id}
                className={`flex shrink-0 flex-col gap-2 ${phone ? "w-[220px]" : "w-[300px]"}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("emails", `campaigns/${r.id}`)}
                    className="min-w-0 flex-1 text-left font-medium break-words text-ink hover:underline"
                  >
                    {r.name}
                  </button>
                  <Badge tone={TONE[r.status] ?? "gray"}>
                    {LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
                <button
                  type="button"
                  aria-label={`Open ${r.name}`}
                  onClick={() => navigate("emails", `campaigns/${r.id}`)}
                  className="group block rounded-[10px] text-left"
                >
                  {kit.data ? (
                    <Thumb row={r} kit={kit.data} phone={phone} />
                  ) : (
                    <div className="h-[420px] rounded-[10px] bg-card shadow-rest" />
                  )}
                </button>
                {r.subject ? (
                  <span className="text-[12px] break-words text-muted">
                    {r.subject}
                  </span>
                ) : null}
                <span className="flex flex-wrap items-center gap-0.5">
                  <IconButton
                    label={`Move ${r.name} left`}
                    disabled={busy || i === 0}
                    onClick={() =>
                      void run(
                        async () => (
                          await place(r.id, groupId, i - 1),
                          reload()
                        ),
                      )
                    }
                  >
                    <ArrowLeft size={13} />
                  </IconButton>
                  <IconButton
                    label={`Move ${r.name} right`}
                    disabled={busy || i === list.length - 1}
                    onClick={() =>
                      void run(
                        async () => (
                          await place(r.id, groupId, i + 1),
                          reload()
                        ),
                      )
                    }
                  >
                    <ArrowRight size={13} />
                  </IconButton>
                  <span className="flex-1" />
                  <IconButton
                    label={`Take ${r.name} out of the group`}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        async () => (await place(r.id, null, null), reload()),
                      )
                    }
                  >
                    <X size={13} />
                  </IconButton>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-[14px] font-medium text-ink">
              Add the first email to this group
            </span>
            <Button onClick={() => void add("new")} disabled={busy}>
              <Plus size={14} /> New email
            </Button>
          </div>
        )}
      </div>
    </Page>
  );
}

/** An email as it would arrive, scaled down: the draft built in the brand, or what was sent. */
function Thumb({ row, kit, phone }: { row: Row; kit: Kit; phone: boolean }) {
  const html = useMemo(() => {
    if (row.status !== "draft" && row.html) return filled(row.html);
    try {
      return filled(
        compileEmail(
          kit.system,
          readEmailDoc(row.doc ?? {}, { allowHtml: true }),
          { tokens: kit.tokens, logo: kit.logo },
        ).html,
      );
    } catch {
      return "<!doctype html><html><body></body></html>";
    }
  }, [row, kit]);
  const w = phone ? 390 : 640;
  const scale = (phone ? 220 : 300) / w;
  return (
    <div className="relative h-[420px] overflow-hidden rounded-[10px] bg-card shadow-rest transition-[box-shadow,transform] duration-[150ms] ease-out group-hover:-translate-y-0.5 group-hover:shadow-hover motion-reduce:transform-none">
      <iframe
        title=""
        aria-hidden="true"
        tabIndex={-1}
        loading="lazy"
        srcDoc={html}
        style={{ width: w, height: 420 / scale, transform: `scale(${scale})` }}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-paper"
      />
    </div>
  );
}
