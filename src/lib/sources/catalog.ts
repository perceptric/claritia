// The tools Claritia connects to, for Settings › Sources. Data only, so the browser can load it.

import type { Group, ObjectKind } from "./types.ts";

export type KeyField = { key: string; label: string; secret?: boolean; placeholder?: string; optional?: boolean; multiline?: boolean };
export type Entry = {
  kind: string;
  label: string;
  group: Group;
  /** For the logo. */
  domain: string;
  /** One-click sign-in when the app is registered; keys otherwise. */
  oauth?: boolean;
  keys?: KeyField[];
  /** Records arrive by webhook to a URL we hand out. */
  hook?: boolean;
  /** Signs its webhooks with a secret the person pastes. */
  hookSecret?: boolean;
  /** A database read by a saved query. */
  warehouse?: boolean;
  /** The read-only user to create, shown on the connect screen. */
  grant?: string;
  objects: ObjectKind[];
  twoWay?: boolean;
  /** Takes new contacts from Claritia (form destinations) without being two-way. */
  pushes?: boolean;
  /** An email tool: a form fill joins one of its lists (docs/integrations-plan.md step 1); `tags` when it keeps tags. */
  lists?: boolean;
  tags?: boolean;
  /** Sheets and databases: a row per form fill (docs/integrations-plan.md step 2). */
  rows?: boolean;
  /** Ad tools: a form's Settings › Tracking sends its fills and bookings to them (docs/integrations-plan.md, Next step 2). */
  ads?: boolean;
};

const key = (label = "API key"): KeyField[] => [{ key: "api_key", label, secret: true }];

export const CATALOG: Entry[] = [
  { kind: "hubspot", label: "HubSpot", group: "crm", domain: "hubspot.com", oauth: true, keys: key("Private app token"), objects: ["companies", "contacts", "opportunities", "lists"], twoWay: true },
  {
    kind: "salesforce",
    label: "Salesforce",
    group: "crm",
    domain: "salesforce.com",
    oauth: true,
    objects: ["companies", "contacts", "opportunities"],
    twoWay: true,
  },
  { kind: "omniscient", label: "Omniscient", group: "crm", domain: "tryomniscient.com", objects: ["companies", "contacts", "opportunities"], twoWay: true },
  { kind: "pipedrive", label: "Pipedrive", group: "crm", domain: "pipedrive.com", oauth: true, keys: key("API token"), pushes: true, objects: ["companies", "contacts", "opportunities"] },
  { kind: "attio", label: "Attio", group: "crm", domain: "attio.com", oauth: true, keys: key("Access token"), pushes: true, objects: ["companies", "contacts", "opportunities"] },
  { kind: "close", label: "Close", group: "crm", domain: "close.com", keys: key(), pushes: true, objects: ["contacts"] },
  { kind: "mailchimp", label: "Mailchimp", group: "email", domain: "mailchimp.com", oauth: true, keys: key(), objects: ["contacts"], pushes: true, lists: true, tags: true },
  { kind: "klaviyo", label: "Klaviyo", group: "email", domain: "klaviyo.com", keys: key("Private API key"), objects: ["contacts"], pushes: true, lists: true },
  {
    kind: "activecampaign",
    label: "ActiveCampaign",
    group: "email",
    domain: "activecampaign.com",
    keys: [{ key: "url", label: "API URL", placeholder: "https://you.api-us1.com" }, ...key()],
    objects: ["contacts"],
    pushes: true,
    lists: true,
    tags: true,
  },
  { kind: "brevo", label: "Brevo", group: "email", domain: "brevo.com", keys: key(), objects: ["contacts"], pushes: true, lists: true },
  { kind: "kit", label: "Kit", group: "email", domain: "kit.com", keys: key("API secret"), objects: ["contacts", "suppressions"], pushes: true, lists: true, tags: true },
  { kind: "mailerlite", label: "MailerLite", group: "email", domain: "mailerlite.com", keys: key("API token"), objects: ["contacts"], pushes: true, lists: true },
  { kind: "stripe", label: "Stripe", group: "product", domain: "stripe.com", keys: key("Restricted key"), objects: ["contacts"] },
  { kind: "intercom", label: "Intercom", group: "product", domain: "intercom.com", keys: key("Access token"), objects: ["contacts"] },
  { kind: "typeform", label: "Typeform", group: "form", domain: "typeform.com", hook: true, hookSecret: true, objects: ["contacts"] },
  { kind: "tally", label: "Tally", group: "form", domain: "tally.so", hook: true, hookSecret: true, objects: ["contacts"] },
  { kind: "webflow", label: "Webflow forms", group: "form", domain: "webflow.com", hook: true, objects: ["contacts"] },
  { kind: "calendly", label: "Calendly", group: "event", domain: "calendly.com", hook: true, hookSecret: true, objects: ["contacts"] },
  { kind: "calcom", label: "Cal.com", group: "event", domain: "cal.com", hook: true, hookSecret: true, objects: ["contacts"] },
  {
    kind: "postgres",
    label: "PostgreSQL",
    group: "warehouse",
    domain: "postgresql.org",
    warehouse: true,
    keys: [
  { key: "host", label: "Host" },
  { key: "port", label: "Port", placeholder: "5432", optional: true },
  { key: "database", label: "Database" },
  { key: "user", label: "User" },
  { key: "password", label: "Password", secret: true },
],
    objects: [],
    pushes: true,
    rows: true,
    grant: "create user claritia with password '…';\ngrant usage, create on schema public to claritia;\ngrant select on all tables in schema public to claritia;",
  },
  {
    kind: "redshift",
    label: "Amazon Redshift",
    group: "warehouse",
    domain: "aws.amazon.com",
    warehouse: true,
    keys: [
  { key: "host", label: "Host" },
  { key: "port", label: "Port", placeholder: "5439", optional: true },
  { key: "database", label: "Database" },
  { key: "user", label: "User" },
  { key: "password", label: "Password", secret: true },
],
    objects: [],
    grant: "create user claritia_read password '…';\ngrant usage on schema public to claritia_read;\ngrant select on all tables in schema public to claritia_read;",
  },
  {
    kind: "mysql",
    label: "MySQL",
    group: "warehouse",
    domain: "mysql.com",
    warehouse: true,
    keys: [
  { key: "host", label: "Host" },
  { key: "port", label: "Port", placeholder: "3306", optional: true },
  { key: "database", label: "Database" },
  { key: "user", label: "User" },
  { key: "password", label: "Password", secret: true },
],
    objects: [],
    pushes: true,
    rows: true,
    grant: "create user 'claritia'@'%' identified by '…' require ssl;\ngrant select, insert, create, alter on yourdb.* to 'claritia'@'%';",
  },
  {
    kind: "clickhouse",
    label: "ClickHouse",
    group: "warehouse",
    domain: "clickhouse.com",
    warehouse: true,
    keys: [{ key: "url", label: "HTTPS address", placeholder: "https://abc.clickhouse.cloud:8443" }, { key: "user", label: "User" }, { key: "password", label: "Password", secret: true }],
    objects: [],
    grant: "create user claritia_read identified by '…' settings readonly = 1;\ngrant select on yourdb.* to claritia_read;",
  },
  {
    kind: "bigquery",
    label: "BigQuery",
    group: "warehouse",
    domain: "cloud.google.com",
    warehouse: true,
    keys: [{ key: "service_account", label: "Service account key (JSON)", secret: true, multiline: true }, { key: "project", label: "Project", optional: true }, { key: "location", label: "Location", placeholder: "US", optional: true }],
    objects: [],
    grant: "Give the service account BigQuery Data Viewer on the dataset and BigQuery Job User on the project.",
  },
  {
    kind: "snowflake",
    label: "Snowflake",
    group: "warehouse",
    domain: "snowflake.com",
    warehouse: true,
    keys: [
      { key: "account", label: "Account", placeholder: "myorg-myaccount" },
      { key: "user", label: "User" },
      { key: "private_key", label: "Private key (PEM)", secret: true, multiline: true },
      { key: "warehouse", label: "Warehouse" },
      { key: "database", label: "Database" },
      { key: "role", label: "Role", optional: true },
    ],
    objects: [],
    grant: "create role claritia_read;\ngrant usage on warehouse … to role claritia_read;\ngrant usage on database … to role claritia_read;\ngrant usage on all schemas in database … to role claritia_read;\ngrant select on all tables in database … to role claritia_read;\ncreate user claritia_read default_role = claritia_read rsa_public_key = '…';\ngrant role claritia_read to user claritia_read;",
  },
  {
    kind: "databricks",
    label: "Databricks",
    group: "warehouse",
    domain: "databricks.com",
    warehouse: true,
    keys: [{ key: "host", label: "Workspace address", placeholder: "dbc-123.cloud.databricks.com" }, { key: "warehouse_id", label: "SQL warehouse id" }, { key: "token", label: "Access token", secret: true }],
    objects: [],
    grant: "Make a service principal with CAN USE on the SQL warehouse and SELECT on the tables, and an access token for it.",
  },
  // Sheets and databases (docs/integrations-plan.md step 2): a row per form fill, nothing read back.
  { kind: "meta_ads", label: "Meta Conversions API", group: "ads", domain: "meta.com", keys: [{ key: "access_token", label: "Access token", secret: true }], objects: [], ads: true },
  { kind: "google_ads", label: "Google Ads", group: "ads", domain: "ads.google.com", oauth: true, objects: [], ads: true },
  { kind: "google_sheets", label: "Google Sheets", group: "sheets", domain: "sheets.google.com", oauth: true, objects: [], pushes: true, rows: true },
  { kind: "airtable", label: "Airtable", group: "sheets", domain: "airtable.com", oauth: true, keys: key("Personal access token"), objects: [], pushes: true, rows: true },
  { kind: "excel", label: "Excel Online", group: "sheets", domain: "excel.cloud.microsoft", oauth: true, objects: [], pushes: true, rows: true },
  { kind: "notion", label: "Notion", group: "sheets", domain: "notion.so", oauth: true, keys: key("Integration secret"), objects: [], pushes: true, rows: true },
  { kind: "api", label: "Webhook", group: "api", domain: "", hook: true, objects: ["contacts"] },
];

export const GROUPS: { id: Group; label: string }[] = [
  { id: "crm", label: "CRMs" },
  { id: "email", label: "Email tools" },
  { id: "sheets", label: "Sheets and databases" },
  { id: "form", label: "Forms" },
  { id: "event", label: "Meetings and events" },
  { id: "product", label: "Product and billing" },
  { id: "warehouse", label: "Warehouses and databases" },
  { id: "api", label: "Anything else" },
];

export const entryOf = (kind: string) => CATALOG.find((e) => e.kind === kind);
