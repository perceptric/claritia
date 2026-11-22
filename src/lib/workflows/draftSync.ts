// Which copy of a workflow's draft the editor works on (docs/workflows.md). The app shows a saved copy of a workflow
// at once and loads the newest one behind it, so the editor can start from an older revision than the server's. When
// a newer revision arrives and nothing on screen is unsaved, the editor takes it quietly; a save from the old
// revision would be refused as someone else's change when it was only the person's own earlier save. With unsaved
// changes on screen, it keeps them, and the save asks which to keep.

export type DraftSync = "take" | "keep";

export function draftSync(o: { server: number; editor: number; unsaved: boolean; saving: boolean }): DraftSync {
  if (o.server <= o.editor) return "keep";
  return o.unsaved || o.saving ? "keep" : "take";
}
