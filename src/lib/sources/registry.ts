// Connectors by kind. Server only (connectors sign and check webhooks with node:crypto).

import { attio, close, pipedrive } from "./crms.ts";
import { activecampaign, brevo, kit, klaviyo, mailchimp, mailerlite } from "./email.ts";
import { api, calcom, calendly, tally, typeform, webflow } from "./forms.ts";
import { hubspot } from "./hubspot.ts";
import { omniscient } from "./omniscient.ts";
import { intercom, stripe } from "./product.ts";
import { salesforce } from "./salesforce.ts";
import { excel } from "./excel.ts";
import { googleAds, metaAds } from "./ads.ts";
import { twilio } from "./twilio.ts";
import { MORE_CRMS } from "./moreCrms.ts";
import { discord, teams } from "./chat.ts";
import { WORK_TOOLS } from "./work.ts";
import { ANALYTICS } from "./analytics.ts";
import { DOC_TOOLS } from "./documents.ts";
import { FILE_TOOLS } from "./files.ts";
import { airtable, googleForms, googleSheets, notion } from "./rows.ts";
import type { Connector } from "./types.ts";
import { WAREHOUSES } from "./warehouse.ts";

const ALL: Connector[] = [hubspot, salesforce, omniscient, pipedrive, attio, close, mailchimp, klaviyo, activecampaign, brevo, kit, mailerlite, stripe, intercom, typeform, tally, webflow, calendly, calcom, api, googleSheets, airtable, notion, googleForms, excel, metaAds, googleAds, twilio, ...MORE_CRMS, teams, discord, ...WORK_TOOLS, ...DOC_TOOLS, ...ANALYTICS, ...FILE_TOOLS, ...WAREHOUSES];
const BY_KIND = new Map(ALL.map((c) => [c.kind, c]));

export const connectorFor = (kind: string): Connector | undefined => BY_KIND.get(kind);
export const CONNECTORS = ALL;
