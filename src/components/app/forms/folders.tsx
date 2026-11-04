"use client";

// Form folders (126, docs/forms-plan.md › Folders): Forms in the sidebar opens onto its folders, each holding forms.
// The folders show under Forms with how many forms each holds, and New folder; a folder's page is /forms/folder:<id>.
// Before 126 there are no folders and nothing here shows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { askText } from "../Dialogs";
import { errorText, invalidate, must, useQuery } from "../ui";
import { Ic } from "./ic";

export type FormFolder = { id: string; name: string; position: number };
export type Folders = { ready: boolean; folders: FormFolder[]; byForm: Record<string, string> };

const NONE: Folders = { ready: false, folders: [], byForm: {} };
export const folderKey = (ws: string) => `form_folders:${ws}`;
/** The page of one folder, as the app's address holds it. */
export const folderPage = (id: string) => `folder:${id}`;

export function useFormFolders(sb: SupabaseClient, ws: string | null) {
  return useQuery<Folders>(ws ? folderKey(ws) : null, async () => {
    if (!ws) return NONE;
    const [f, m] = await Promise.all([sb.from("form_folders").select("id, name, position").eq("workspace_id", ws).order("position").order("created_at"), sb.from("forms").select("id, folder_id").eq("workspace_id", ws)]);
    // Before 126: no table, no column. The folders simply aren't there yet.
    if (f.error || m.error) return NONE;
    const byForm: Record<string, string> = {};
    for (const r of (m.data ?? []) as { id: string; folder_id: string | null }[]) if (r.folder_id) byForm[r.id] = r.folder_id;
    return { ready: true, folders: (f.data ?? []) as FormFolder[], byForm };
  });
}

/** Make a folder, named in the app's own dialog. Its id, or null when cancelled. */
export async function newFolder(sb: SupabaseClient, ws: string): Promise<string | null> {
  const name = (await askText("New folder", { placeholder: "Sales, Hiring, Events", ok: "Create folder" }))?.trim();
  if (!name) return null;
  const id = must(await sb.rpc("form_folder_save", { p_ws: ws, p_id: null, p_name: name })) as string;
  invalidate(folderKey(ws));
  return id;
}

export async function renameFolder(sb: SupabaseClient, ws: string, f: FormFolder): Promise<boolean> {
  const name = (await askText("Rename folder", { initial: f.name, ok: "Save" }))?.trim();
  if (!name || name === f.name) return false;
  must(await sb.rpc("form_folder_save", { p_ws: ws, p_id: f.id, p_name: name }));
  invalidate(folderKey(ws));
  return true;
}

export async function moveForm(sb: SupabaseClient, ws: string, form: string, folder: string | null) {
  must(await sb.rpc("form_set_folder", { p_ws: ws, p_id: form, p_folder: folder }));
  invalidate(folderKey(ws));
}

/**
 * The folders under Forms in the app's sidebar: each with its count, the open one marked, and New folder. Shown only
 * once 126 is in and the sidebar is wide.
 */
export function FormFolderNav({ sb, ws, current, open, navigate, onError }: { sb: SupabaseClient; ws: string; current: string; open: boolean; navigate: (r: "forms", id?: string) => void; onError?: (m: string) => void }) {
  const q = useFormFolders(sb, ws);
  if (!q.data?.ready || !open) return null;
  const { folders, byForm } = q.data;
  const count = (id: string) => Object.values(byForm).filter((x) => x === id).length;
  return (
    <div data-form-folders="" className="ml-[18px] flex flex-col gap-[1px] border-l border-line pl-[6px]">
      {folders.map((f) => {
        const on = current === folderPage(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => navigate("forms", folderPage(f.id))}
            className={`flex h-[30px] min-w-0 items-center gap-[8px] rounded-md px-[8px] text-left text-[13px] transition-colors duration-[120ms] ${on ? "bg-card font-medium text-ink shadow-chip" : "text-body hover:bg-hover hover:text-ink"}`}
          >
            <Ic n="folder" s={13} />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{f.name}</span>
            <span className="text-[12px] text-faint tabular-nums">{count(f.id)}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() =>
          void newFolder(sb, ws)
            .then((id) => id && navigate("forms", folderPage(id)))
            .catch((e) => onError?.(errorText(e)))
        }
        className="flex h-[30px] items-center gap-[8px] rounded-md px-[8px] text-left text-[13px] text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-ink"
      >
        <Ic n="plus" s={13} />
        New folder
      </button>
    </div>
  );
}
