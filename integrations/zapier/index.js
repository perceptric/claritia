// Claritia for Zapier (docs/integrations-plan.md, Next step 1). Built on the Forms API: sign-in with OAuth (Claritia's
// approve page), REST hooks for the triggers (POST and DELETE /api/v1/hooks), and /api/v1/events for each trigger's
// sample. Deploy with the Zapier CLI: `zapier push`, with CLIENT_ID=zapier and CLIENT_SECRET set by `zapier env:set`
// to the server's OAUTH_ZAPIER_SECRET.

const { version } = require("./package.json");
const { version: platformVersion } = require("zapier-platform-core");

const BASE = process.env.CLARITIA_BASE || "https://app.tryclaritia.com";
const API = `${BASE}/api/v1`;

// The one object each event carries, with its event name and id (src/lib/hooks/api.ts itemOf).
const itemOf = (b) => {
  const d = (b && b.data) || {};
  return Object.assign({}, d.fill || d.meeting || d.lead || {}, { event: b.event, event_id: b.id, test: !!b.test });
};

const authentication = {
  type: "oauth2",
  oauth2Config: {
    authorizeUrl: {
      url: `${BASE}/oauth/authorize`,
      params: { client_id: "{{process.env.CLIENT_ID}}", state: "{{bundle.inputData.state}}", redirect_uri: "{{bundle.inputData.redirect_uri}}", response_type: "code" },
    },
    getAccessToken: {
      url: `${BASE}/api/oauth/token`,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: {
        code: "{{bundle.inputData.code}}",
        client_id: "{{process.env.CLIENT_ID}}",
        client_secret: "{{process.env.CLIENT_SECRET}}",
        grant_type: "authorization_code",
        redirect_uri: "{{bundle.inputData.redirect_uri}}",
      },
    },
    autoRefresh: false,
  },
  test: { url: `${API}/me` },
  connectionLabel: "{{workspace.name}}",
};

const withToken = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.access_token) request.headers.Authorization = `Bearer ${bundle.authData.access_token}`;
  return request;
};

const formField = { key: "form", label: "Form", dynamic: "form_list.id.name", required: false, helpText: "Leave empty for every form." };

const hookTrigger = ({ key, noun, label, description, event, forms }) => ({
  key,
  noun,
  display: { label, description },
  operation: {
    type: "hook",
    inputFields: forms ? [formField] : [],
    performSubscribe: async (z, bundle) => {
      const r = await z.request({ url: `${API}/hooks`, method: "POST", body: { url: bundle.targetUrl, event, form: (forms && bundle.inputData.form) || undefined, description: `Zapier: ${label}` } });
      return r.data;
    },
    performUnsubscribe: async (z, bundle) => {
      const r = await z.request({ url: `${API}/hooks/${bundle.subscribeData.id}`, method: "DELETE" });
      return r.data;
    },
    perform: (z, bundle) => [itemOf(bundle.cleanedRequest)],
    performList: async (z, bundle) => {
      const r = await z.request({ url: `${API}/events`, params: { event, form: (forms && bundle.inputData.form) || "", limit: "3", sample: "1" } });
      return r.data.items;
    },
    sample: { id: "00000000-0000-0000-0000-000000000000", event, event_id: "evt_test", test: true },
  },
});

const listTrigger = (key, noun, path, field) => ({
  key,
  noun,
  display: { label: `List ${noun}s`, description: `For the ${noun} picker.`, hidden: true },
  operation: {
    perform: async (z) => (await z.request({ url: `${API}/${path}` })).data[field],
    sample: { id: "00000000-0000-0000-0000-000000000000", name: noun },
  },
});

module.exports = {
  version,
  platformVersion,
  authentication,
  beforeRequest: [withToken],
  triggers: {
    new_fill: hookTrigger({ key: "new_fill", noun: "Fill", label: "New Fill", description: "Starts when someone fills in a form.", event: "form.submitted", forms: true }),
    new_booking: hookTrigger({ key: "new_booking", noun: "Booking", label: "New Booking", description: "Starts when someone books a meeting.", event: "meeting.booked" }),
    booking_canceled: hookTrigger({ key: "booking_canceled", noun: "Booking", label: "Booking Canceled", description: "Starts when a meeting is canceled.", event: "meeting.canceled" }),
    lead_routed: hookTrigger({ key: "lead_routed", noun: "Lead", label: "Lead Routed", description: "Starts when routing gives a lead an owner, or finds none.", event: "lead.routed" }),
    form_list: listTrigger("form_list", "Form", "forms", "forms"),
    workflow_list: listTrigger("workflow_list", "Workflow", "workflows", "workflows"),
  },
  searches: {
    find_fill: {
      key: "find_fill",
      noun: "Fill",
      display: { label: "Find Fill", description: "Finds the latest fill from an email." },
      operation: {
        inputFields: [{ key: "email", label: "Email", required: true }, formField],
        perform: async (z, bundle) => {
          const r = await z.request({ url: `${API}/events`, params: { event: "form.submitted", email: bundle.inputData.email, form: bundle.inputData.form || "", limit: "1" } });
          return r.data.items;
        },
        sample: { id: "00000000-0000-0000-0000-000000000000", email: "ada@example.com", event: "form.submitted" },
      },
    },
  },
  creates: {
    add_to_workflow: {
      key: "add_to_workflow",
      noun: "Contact",
      display: { label: "Add Contact to Workflow", description: "Adds someone to a live workflow, making the contact if it's new." },
      operation: {
        inputFields: [
          { key: "workflow", label: "Workflow", dynamic: "workflow_list.id.name", required: true },
          { key: "email", label: "Email", required: true },
          { key: "first_name", label: "First name" },
          { key: "last_name", label: "Last name" },
        ],
        perform: async (z, bundle) => {
          const { workflow, email, first_name, last_name } = bundle.inputData;
          const r = await z.request({ url: `${API}/workflows/${workflow}/contacts`, method: "POST", body: { email, first_name, last_name } });
          return r.data;
        },
        sample: { added: true, contact_id: "00000000-0000-0000-0000-000000000000" },
      },
    },
  },
};
