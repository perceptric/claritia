// Claritia for Activepieces (docs/integrations-plan.md, Next step 1). Built on the Forms API: sign-in with OAuth
// (Claritia's approve page; client id `activepieces`, secret = the server's OAUTH_ACTIVEPIECES_SECRET), REST hooks
// for the triggers (POST and DELETE /api/v1/hooks), and /api/v1/events for each trigger's sample. Publish with the
// Activepieces CLI from a pieces repo (`npm run publish-piece`).

import { HttpMethod, httpClient } from "@activepieces/pieces-common";
import { createAction, createPiece, createTrigger, OAuth2PropertyValue, PieceAuth, Property, TriggerStrategy } from "@activepieces/pieces-framework";
import { PieceCategory } from "@activepieces/shared";

const BASE = "https://app.tryclaritia.com";
const API = `${BASE}/api/v1`;

export const claritiaAuth = PieceAuth.OAuth2({
  description: "Sign in to Claritia",
  authUrl: `${BASE}/oauth/authorize`,
  tokenUrl: `${BASE}/api/oauth/token`,
  required: true,
  scope: ["forms"],
});

type Body = { id: string; event: string; test?: boolean; data?: { fill?: object; meeting?: object; lead?: object } };
const itemOf = (b: Body) => ({ ...(b.data?.fill ?? b.data?.meeting ?? b.data?.lead ?? {}), event: b.event, event_id: b.id, test: !!b.test });

async function call<T>(auth: unknown, method: HttpMethod, path: string, body?: object, query?: Record<string, string>): Promise<T> {
  const r = await httpClient.sendRequest<T>({
    method,
    url: `${API}${path}`,
    headers: { authorization: `Bearer ${(auth as OAuth2PropertyValue).access_token}` },
    body,
    queryParams: query,
  });
  return r.body;
}

const formPick = Property.Dropdown({
  displayName: "Form",
  description: "Leave empty for every form.",
  required: false,
  refreshers: [],
  auth: claritiaAuth,
  options: async ({ auth }) => {
    if (!auth) return { disabled: true, options: [], placeholder: "Connect Claritia first" };
    const r = await call<{ forms: { id: string; name: string }[] }>(auth, HttpMethod.GET, "/forms");
    return { disabled: false, options: r.forms.map((f) => ({ label: f.name, value: f.id })) };
  },
});

const hookTrigger = (name: string, displayName: string, description: string, event: string, forms = false) =>
  createTrigger({
    auth: claritiaAuth,
    name,
    displayName,
    description,
    type: TriggerStrategy.WEBHOOK,
    props: forms ? { form: formPick } : {},
    sampleData: { id: "00000000-0000-0000-0000-000000000000", event, event_id: "evt_test", test: true },
    async onEnable(ctx) {
      const form = (ctx.propsValue as { form?: string }).form;
      const r = await call<{ id: string }>(ctx.auth, HttpMethod.POST, "/hooks", { url: ctx.webhookUrl, event, form: form || undefined, description: "Activepieces" });
      await ctx.store.put("hook", r.id);
    },
    async onDisable(ctx) {
      const id = await ctx.store.get<string>("hook");
      if (id) await call(ctx.auth, HttpMethod.DELETE, `/hooks/${id}`);
    },
    async run(ctx) {
      return [itemOf(ctx.payload.body as Body)];
    },
    async test(ctx) {
      const form = (ctx.propsValue as { form?: string }).form ?? "";
      const r = await call<{ items: object[] }>(ctx.auth, HttpMethod.GET, "/events", undefined, { event, form, limit: "3", sample: "1" });
      return r.items;
    },
  });

const findFill = createAction({
  auth: claritiaAuth,
  name: "find_fill",
  displayName: "Find Fill",
  description: "Finds the latest fills from an email.",
  props: { email: Property.ShortText({ displayName: "Email", required: true }), form: formPick },
  async run(ctx) {
    const r = await call<{ items: object[] }>(ctx.auth, HttpMethod.GET, "/events", undefined, { event: "form.submitted", email: ctx.propsValue.email, form: ctx.propsValue.form ?? "", limit: "1" });
    return r.items;
  },
});

const addToWorkflow = createAction({
  auth: claritiaAuth,
  name: "add_to_workflow",
  displayName: "Add Contact to Workflow",
  description: "Adds someone to a live workflow, making the contact if it's new.",
  props: {
    workflow: Property.Dropdown({
      displayName: "Workflow",
      required: true,
      refreshers: [],
      auth: claritiaAuth,
      options: async ({ auth }) => {
        if (!auth) return { disabled: true, options: [], placeholder: "Connect Claritia first" };
        const r = await call<{ workflows: { id: string; name: string }[] }>(auth, HttpMethod.GET, "/workflows");
        return { disabled: false, options: r.workflows.map((w) => ({ label: w.name, value: w.id })) };
      },
    }),
    email: Property.ShortText({ displayName: "Email", required: true }),
    first_name: Property.ShortText({ displayName: "First name", required: false }),
    last_name: Property.ShortText({ displayName: "Last name", required: false }),
  },
  async run(ctx) {
    const { workflow, email, first_name, last_name } = ctx.propsValue;
    return call(ctx.auth, HttpMethod.POST, `/workflows/${workflow}/contacts`, { email, first_name, last_name });
  },
});

export const claritia = createPiece({
  displayName: "Claritia",
  description: "Forms, meetings and workflows.",
  auth: claritiaAuth,
  minimumSupportedRelease: "0.30.0",
  logoUrl: `${BASE}/icon.svg`,
  categories: [PieceCategory.FORMS_AND_SURVEYS],
  authors: ["claritia"],
  actions: [findFill, addToWorkflow],
  triggers: [
    hookTrigger("new_fill", "New Fill", "Starts when someone fills in a form.", "form.submitted", true),
    hookTrigger("new_booking", "New Booking", "Starts when someone books a meeting.", "meeting.booked"),
    hookTrigger("booking_canceled", "Booking Canceled", "Starts when a meeting is canceled.", "meeting.canceled"),
    hookTrigger("lead_routed", "Lead Routed", "Starts when routing gives a lead an owner, or finds none.", "lead.routed"),
  ],
});
