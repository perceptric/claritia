// One form submission, end to end (docs/form-templates.md Part 1): check every answer again, turn the mapped ones
// into a contact with the source "form", then record the submission, the form.submitted activity and the consent
// in form_submit. The route reads the request and uploads files; this part is shared with the database tests.

import { writeContacts } from "../contacts/contacts.ts";
import type { Rpc } from "../jobs.ts";
import { checkAnswers } from "./answers.ts";
import { consentFor, toContact, type Ctx } from "./contact.ts";
import { score } from "./logic.ts";
import type { FormSchema, FormSettings } from "./types.ts";

export type LiveForm = { id: string; workspace_id: string; schema: FormSchema; settings: FormSettings };

export type SubmitInput = {
  form: LiveForm;
  raw: Record<string, unknown>;
  /** The visit's privacy region and country, from the request. */
  region: "strict" | "notice";
  country: string | null;
  /** The opt-in box, in strict regions. */
  ticked: boolean;
  meta: Record<string, string>;
  ipHash: string | null;
};

export type SubmitResult =
  | { ok: true; id: string; contactId: string | null; score: number | null }
  | { ok: false; errors: Record<string, string> }
  | { ok: false; error: string; status: number };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busy, timeout and network errors are tried again with growing waits; anything else is final. */
async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    const { data, error } = await rpc(fn, args);
    if (!error) return data as T;
    if (i >= tries || !/timeout|timed out|fetch failed|ECONN|503|502|504|429|deadlock|could not serialize/i.test(error.message)) throw new Error(error.message);
    await wait(300 * 2 ** (i - 1));
  }
}

export async function submitForm(d: { rpc: Rpc; ctx: Ctx }, input: SubmitInput): Promise<SubmitResult> {
  const { form } = input;
  const checked = checkAnswers(form.schema, input.raw);
  if (Object.keys(checked.errors).length) return { ok: false, errors: checked.errors };
  const c = toContact(form.schema, checked.answers, d.ctx);
  if (c && "error" in c) return { ok: false, errors: { [c.field]: c.error } };

  if (!(await call<boolean>(d.rpc, "form_can_submit", { p_form: form.id, p_ip_hash: input.ipHash }))) {
    return { ok: false, error: "This form isn't taking answers right now. Try again in a few minutes.", status: 429 };
  }

  let contactId: string | null = null;
  const contact = c?.contact;
  if (contact) {
    const written = await writeContacts(d.rpc, form.workspace_id, "form", [{ ...contact, basis: undefined }]);
    contactId = written.ids[0] ?? null;
  }
  const consent = contactId ? consentFor(form.settings, input.region, input.ticked, contact?.country ?? input.country) : null;
  const points = score(form.schema, checked.answers);
  try {
    const id = await call<string>(d.rpc, "form_submit", {
      p_form: form.id,
      p_contact: contactId,
      p_answers: checked.answers,
      p_score: points,
      p_meta: input.meta,
      p_ip_hash: input.ipHash,
      p_consent: consent,
    });
    return { ok: true, id, contactId, score: points };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/Too many submissions/.test(m)) return { ok: false, error: "This form isn't taking answers right now. Try again in a few minutes.", status: 429 };
    if (/Form not found/.test(m)) return { ok: false, error: "This form is closed.", status: 404 };
    throw e;
  }
}
