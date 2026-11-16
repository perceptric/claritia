// What each tool on Settings › Integrations is, what Claritia does with it, the access it takes, how it connects and
// where it's used: the tool's detail sheet (the card is clicked). Written from the connectors (src/lib/sources/*.ts),
// the delivery pipeline (src/lib/delivery/send.ts), the workflow steps (worker-intel/jobs/workflows.ts), Tracking
// (src/lib/track/server.ts), meetings and payments. Data only, so the browser can load it; no AI at runtime.
// tests/toolDetails.test.ts checks every tool on the page has a full entry, the sign-in scopes match oauth.ts and the
// tools that sign in on Composio match composio.ts.

import { CATALOG, entryOf, type Entry } from "./catalog.ts";

export type ToolDetail = {
  /** What the tool is, in a few plain sentences. */
  about: string;
  /** Every way Claritia uses it. */
  does: string[];
  /** The access the connection gives, in plain words. */
  access: string[];
  /** How it connects, and what Disconnect does. */
  connects: string;
  /** The screens it's used on. */
  where: string[];
};

/** How the tool connects on this server. */
export type Way = "composio" | "signin" | "signin_or_key" | "key" | "hook" | "omniscient" | "stripe" | "app";

type Base = {
  about: string;
  does: string[];
  /** What Claritia's code reads and writes in the tool, in plain words (part of the access). */
  uses: string[];
  where: string[];
  /** A key tool: what to paste and where it's found (only where the connect form or the setup docs say). */
  key?: string;
  /** On Composio with a key: what Composio's page asks for. */
  asks?: string;
  /** What Claritia never does there, where the code shows it. */
  never?: string[];
};

// Screens -----------------------------------------------------------------------------------------------------

const SYNC = "Form › Sync, where you turn it on for a form and pick where fills go";
const SEND_TO = "Form Studio › On submission › Send to";
const SUBMISSIONS = "Form › Submissions, the Sync column on each fill";
const INTEGRATIONS = "Settings › Integrations, to connect and disconnect it";

// Bullets several tools share ---------------------------------------------------------------------------------

const retry = (n: string) =>
  `If ${n} is down, slow or busy, Claritia tries the fill again after 1, 5 and 30 minutes, then after 2 and 6 hours. After the last try the fill shows as not delivered in the form's Sync tab, where Send again sends it once more.`;
const linked = (n: string) => `Each fill's Sync column in the form's Submissions shows whether it reached ${n}, with a link to what it made there.`;
const gone = (n: string, what: string) => `If the ${what} was deleted in ${n} since Claritia last sent this person, Claritia makes it again as new instead of failing.`;
const testFills = "Test fills go too, marked test, so you can check the setup before you share the form.";

// The tools -----------------------------------------------------------------------------------------------------

const BASES: Record<string, Base> = {
  // CRMs ------------------------------------------------------------------------------------------------------
  hubspot: {
    about:
      "HubSpot is a CRM with marketing, sales and service tools on top. Teams use it to keep every contact and company in one place, send marketing email and track deals. It has a free plan, so many small teams start there.",
    does: [
      "When someone fills a form that sends to HubSpot, Claritia creates or updates the HubSpot contact, matched by email. The same person filling twice stays one contact.",
      "It fills email, first name, last name, job title, phone, country and state, plus the lifecycle stage and lead status when Claritia has them. It leaves Company and Website as HubSpot has them.",
      "Questions you link to a HubSpot property (each question's HubSpot field in Build) go to that property right after the contact is saved, including custom properties.",
      "Per linked question you pick whether an answer overwrites, only fills an empty property, or never changes one; Claritia reads the contact first to follow that.",
      "A property HubSpot no longer has, a read-only one, or a value it refuses is skipped and noted on the fill. The rest still go, and the fill counts as delivered.",
      "Owner: with Routing's pick, the person Routing chose becomes the HubSpot owner, and a contact HubSpot already has keeps its owner. With HubSpot decides, Claritia never writes the owner.",
      "Send email consent: when the person ticks the form's consent box, the contact's legal basis is set to Freely given consent from contact.",
      "When a form's rules match by name as well as email, Claritia first looks for someone with the same first and last name and an email at the same company domain. A hit stops the fill as a possible duplicate, with Create anyway in the Sync tab.",
      gone("HubSpot", "contact"),
      "At connect, Claritia adds three contact properties to your HubSpot: Claritia score, Claritia band and Claritia source.",
      retry("HubSpot"),
      linked("HubSpot"),
    ],
    uses: [
      "Reads your portal's id and address, to label the card and link to records.",
      "Creates and updates contacts in batches of up to 100, and reads contacts by email or id.",
      "Reads the list of contact properties, to link questions to them, and creates the three Claritia properties.",
      "Searches contacts by name and email domain, only for the duplicate check.",
    ],
    never: ["Claritia's code never deletes or archives a HubSpot record."],
    key: "a private app token from HubSpot",
    where: [SYNC, SEND_TO, "Form Studio › Build, each question's HubSpot field", SUBMISSIONS, INTEGRATIONS],
  },
  salesforce: {
    about:
      "Salesforce is the CRM many larger sales teams run on. It keeps leads, contacts, accounts and opportunities, and each company shapes it with its own fields and rules. Admins can control who sees and changes what.",
    does: [
      "For each fill, Claritia looks for a Contact, then an open (unconverted) Lead, with the person's email. It updates the one it finds.",
      "When there's no match, it makes a new Lead, or a new Contact if the form's Sync tab says Make them as Contacts.",
      "It fills Email, First name, Last name, Title, Phone, Country, State, Lead status and Owner. On a Contact, country and state go to the mailing address.",
      "Salesforce needs a last name and a company on every Lead, so a missing one is saved as [not provided]. A question linked to Company fills it right after.",
      "Questions you link to Lead or Contact fields (custom fields included) go to those fields after the record is saved, following each question's overwrite choice.",
      "Owner: Routing's pick sets the owner on new records and keeps the owner on existing ones. Salesforce decides turns on Salesforce's own assignment rules for new records instead.",
      "Send email consent: a ticked consent box clears Email Opt Out on the record.",
      "When a form's rules match by name as well as email, Claritia checks Contacts and Leads for the same name at the same email domain first, and stops on a possible duplicate.",
      gone("Salesforce", "Lead or Contact"),
      retry("Salesforce"),
      linked("Salesforce"),
    ],
    uses: [
      "Reads your org's name and id, and where its API lives.",
      "Queries Contacts and Leads by email, and by name for the duplicate check.",
      "Creates and updates Leads and Contacts, up to 200 at a time.",
      "Reads the Lead and Contact field lists (describe), to link questions and to skip custom fields your org doesn't have.",
    ],
    never: ["Claritia's code never deletes a Salesforce record, and it never converts Leads."],
    where: [SYNC, SEND_TO, "Form Studio › Build, each question's Salesforce field", SUBMISSIONS, INTEGRATIONS],
  },
  omniscient: {
    about:
      "Omniscient is a CRM with deal rooms: shared pages where you and a buyer work through a deal together. It's Claritia's sister product, with the same look.",
    does: [
      "Each fill's contact goes to Omniscient's contact API by email, so a lead handed off from a form lands on the same Omniscient contact every time.",
      "It sends email, name, title and phone, marked as coming from Claritia with Claritia's contact id.",
      "Questions linked to Omniscient contact fields go there after the contact is saved. Omniscient's API never replaces a value a contact already has, so overwrite works as only fill if empty.",
      "At connect, Claritia registers a webhook in Omniscient for contact changes and keeps the signing secret it hands back. Claritia doesn't apply those changes today.",
      retry("Omniscient"),
    ],
    uses: ["Reads your Omniscient workspace's name.", "Creates or updates contacts by email.", "Reads your contact fields, to link questions to them.", "Adds one webhook for contact created and updated."],
    where: [SYNC, SEND_TO, "Form Studio › Build, each question's Omniscient field", INTEGRATIONS],
  },
  pipedrive: {
    about:
      "Pipedrive is a sales CRM built around a visual pipeline of deals. Small sales teams like it because each deal moves across stages like a card on a board.",
    does: [
      "For each fill, Claritia searches Pipedrive for a person with exactly that email, then updates that person or makes a new one.",
      "It fills the name, first name, last name, email and phone (both as the primary work value) and job title.",
      "It doesn't make organizations or deals: the person lands in Pipedrive, and your team takes it from there.",
      gone("Pipedrive", "person"),
      retry("Pipedrive"),
    ],
    uses: ["Reads your company's name and id.", "Searches persons by email, and creates and updates persons."],
    never: ["Claritia's code never deletes a Pipedrive record."],
    key: "an API token from Pipedrive",
    asks: "your Pipedrive API token",
    where: [SYNC, SEND_TO, INTEGRATIONS],
  },
  attio: {
    about:
      "Attio is a flexible CRM you shape around your own data. People and companies are objects you add fields to, and it fills itself in from your email and calendar.",
    does: [
      "For each fill, Claritia asserts the person in Attio by email: one call that makes the person or updates the one already there.",
      "It fills email, first and last name, job title, and phone when the phone is in full international form (it starts with +).",
      "A fill without an email isn't sent, because Attio matches people by email.",
      gone("Attio", "person"),
      retry("Attio"),
    ],
    uses: ["Reads your workspace's name.", "Creates and updates people records."],
    never: ["Claritia's code never deletes an Attio record."],
    key: "an access token from Attio",
    where: [SYNC, SEND_TO, INTEGRATIONS],
  },
  close: {
    about:
      "Close is a sales CRM with calling, email and texting built in. Inside sales teams use it to work through leads quickly without leaving the app.",
    does: [
      "Close keeps people as contacts on leads. For each fill, Claritia looks for a contact with that email across your leads and updates it.",
      "When there's none, it makes a new lead named after the email's domain (acme.com), with the person as its contact.",
      "It fills the contact's name, title, office email and office phone.",
      gone("Close", "contact"),
      retry("Close"),
    ],
    uses: ["Reads your organization's name.", "Searches leads by email, updates contacts and creates leads."],
    never: ["Claritia's code never deletes a Close lead or contact."],
    key: "an API key from Close's settings",
    asks: "your Close API key",
    where: [SYNC, SEND_TO, INTEGRATIONS],
  },
  zoho: {
    about:
      "Zoho CRM is the CRM in Zoho's large family of business apps. It tracks leads, contacts and deals, and runs in data centers around the world.",
    does: [
      "Each fill becomes a Zoho Lead. Claritia searches Leads by email first and updates the one it finds, else creates a new Lead.",
      "It fills Last name (or the full name), First name, Email, Phone and Designation (job title), and sets Lead Source to Claritia.",
      "Zoho needs a Company on every Lead, so Claritia puts the domain of the person's email there.",
      "New Leads run your Zoho workflow rules, as if someone added them by hand.",
      gone("Zoho", "Lead"),
      retry("Zoho"),
      linked("Zoho CRM"),
    ],
    uses: ["Reads your Zoho CRM organization's name and id.", "Searches, creates and updates Leads."],
    never: ["Claritia's code never deletes a Zoho record."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  dynamics: {
    about:
      "Microsoft Dynamics 365 is Microsoft's CRM for sales and customer service. Companies already on Microsoft 365 often use it, and each company has its own Dynamics address.",
    does: [
      "Each fill becomes a Dynamics Lead. Claritia looks for a Lead with that email and updates it, or creates a new one.",
      "It fills first name, last name, email, business phone and job title, with the topic Form lead from Claritia.",
      gone("Dynamics 365", "Lead"),
      retry("Dynamics 365"),
      linked("Dynamics 365"),
    ],
    uses: [
      "Finds the Dynamics environments your account can open (with Claritia's own sign-in, the first one; on Composio, the one you pick on its page).",
      "Reads, creates and updates Leads in that environment.",
    ],
    never: ["Claritia's code never deletes a Dynamics record."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  gohighlevel: {
    about:
      "GoHighLevel is an all-in-one marketing and CRM platform built for agencies. Each client gets a sub-account with its own contacts, funnels and messaging.",
    does: [
      "Each fill goes to one sub-account (location), picked when you connect.",
      "Claritia upserts the contact by email, so GoHighLevel finds a match by your sub-account's own duplicate setting. Source is set to Claritia.",
      "It fills first name, last name and phone.",
      "A fill without an email only updates a contact Claritia already sent before.",
      retry("GoHighLevel"),
      linked("GoHighLevel"),
    ],
    uses: ["Reads the sub-account's name.", "Creates and updates contacts in that sub-account."],
    never: ["Claritia's code never deletes a GoHighLevel contact."],
    asks: "a private integration token and its sub-account (location) id",
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  freshsales: {
    about:
      "Freshsales is the sales CRM from Freshworks. It comes with a phone, email and lead scoring built in, and each account has its own address like acme.myfreshworks.com.",
    does: [
      "Claritia upserts each fill's contact by email: Freshsales updates the person with that email or makes them.",
      "It fills first name, last name, mobile number and job title.",
      "A fill without an email only updates a contact Claritia already sent before.",
      retry("Freshsales"),
      linked("Freshsales"),
    ],
    uses: ["Checks the key works by reading your list of owners.", "Creates and updates contacts."],
    never: ["Claritia's code never deletes a Freshsales record."],
    key: "your Freshsales address (like acme.myfreshworks.com) and an API key from Freshsales' settings",
    asks: "your Freshsales API key and account address",
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  copper: {
    about:
      "Copper is a CRM that lives inside Google Workspace. It shows contacts and deals right in Gmail and builds records from your email for you.",
    does: [
      "For each fill, Claritia asks Copper for a person with that email, updates them if found, or makes a new person.",
      "It fills the name, first and last name, work email, work phone and title.",
      gone("Copper", "person"),
      retry("Copper"),
      linked("Copper"),
    ],
    uses: ["Reads your account's name and id.", "Finds people by email, and creates and updates people."],
    never: ["Claritia's code never deletes a Copper record."],
    key: "an API key from Copper's settings and the email you sign in to Copper with",
    asks: "your Copper API key and your Copper email",
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  keap: {
    about:
      "Keap (once Infusionsoft) is a CRM and marketing tool for small businesses. It keeps contacts, sends follow-up email and takes payments in one place.",
    does: [
      "Claritia uses Keap's create-or-update by email for each fill, so the same person twice is one Keap contact.",
      "It fills first name, last name, the first phone and email, and job title, with API as the source type.",
      "A fill without an email only updates a contact Claritia already sent before.",
      retry("Keap"),
    ],
    uses: ["Reads your account profile's name.", "Creates and updates contacts."],
    never: ["Claritia's code never deletes a Keap contact."],
    where: [SYNC, SEND_TO, INTEGRATIONS],
  },
  monday: {
    about:
      "monday CRM is monday.com's sales CRM. Leads and deals live on boards, where each row is an item and each column holds one detail.",
    does: [
      "Fills go to one board: the Leads board whose link you pasted at connect, or else a board named Leads.",
      "Claritia looks for an item with the person's email in the board's email column, updates it, or adds a new item named after the person.",
      "It fills the board's email and phone columns, and a text column titled like Title, Position or Role with the job title.",
      gone("monday CRM", "item"),
      retry("monday CRM"),
      linked("monday CRM"),
    ],
    uses: ["Reads your account's name, your boards and the Leads board's columns.", "Finds, creates and updates items on that board."],
    never: ["Claritia's code never deletes a monday.com item."],
    key: "an API token from monday.com, and the Leads board's link if it isn't named Leads",
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },

  // Email lists ---------------------------------------------------------------------------------------------
  mailchimp: {
    about:
      "Mailchimp is an email marketing platform for newsletters, campaigns and simple automations. Its contacts live in audiences, and tags group people inside an audience.",
    does: [
      "Each fill adds the person to the audience you pick in the form's Sync tab, with the tags you add there.",
      "Claritia upserts the member by email. A new member is subscribed when they ticked the consent box (or when the form subscribes everyone); otherwise they're kept as transactional.",
      "A person already in the audience keeps their status: someone who unsubscribed stays unsubscribed.",
      "First name, last name and phone go to FNAME, LNAME and PHONE, only where the audience has those merge fields.",
      "A fill without an email isn't sent.",
      retry("Mailchimp"),
    ],
    uses: ["Reads your account's name and its data center.", "Lists your audiences and their merge fields.", "Adds and updates audience members, and adds tags to them."],
    never: ["Claritia's code never removes members, never changes an existing member's subscription, and never sends a campaign."],
    key: "an API key from Mailchimp (it ends in -us21 or similar)",
    where: [SYNC, INTEGRATIONS],
  },
  klaviyo: {
    about:
      "Klaviyo is an email and text marketing platform made for online stores. It keeps a profile per shopper and sends flows and campaigns to lists and segments.",
    does: [
      "Each fill creates or updates the person's Klaviyo profile (email, first and last name, job title, and phone when it's in international form).",
      "With consent ticked (or the form set to subscribe everyone), the profile is subscribed to the list you pick, with email marketing consent.",
      "Without consent, the profile is added to the list but not subscribed to marketing email.",
      "A fill without an email isn't sent.",
      retry("Klaviyo"),
    ],
    uses: ["Reads your account's name.", "Lists your lists.", "Creates and updates profiles, adds them to a list, and subscribes them when they consented."],
    never: ["Claritia's code never deletes profiles and never sends a campaign or flow."],
    key: "a private API key from Klaviyo",
    asks: "your Klaviyo private API key",
    where: [SYNC, INTEGRATIONS],
  },
  activecampaign: {
    about:
      "ActiveCampaign is an email marketing and automation platform. Teams use it to build step-by-step email automations and tag contacts as they act.",
    does: [
      "Only people who can get marketing email are sent: with consent required, a fill without the box ticked is skipped and says why.",
      "Claritia syncs the contact by email (first name, last name, phone) and adds them to the list you pick as an active subscriber.",
      "Each tag you add in the Sync tab is found by name or created, then put on the contact.",
      "A fill without an email isn't sent.",
      retry("ActiveCampaign"),
    ],
    uses: ["Reads the connected user's email.", "Lists your lists and searches your tags.", "Creates or updates contacts, adds them to a list, and creates and adds tags."],
    never: ["Claritia's code never deletes contacts or tags."],
    key: "the API URL from ActiveCampaign › Settings › Developer, and an API key from ActiveCampaign's settings",
    asks: "your ActiveCampaign API key and account address",
    where: [SYNC, INTEGRATIONS],
  },
  brevo: {
    about:
      "Brevo (once Sendinblue) is an email, text and chat marketing platform. Many small businesses in Europe use it for newsletters and transactional email.",
    does: [
      "Only people who can get marketing email are sent; a fill without consent is skipped and says why.",
      "Claritia creates the contact or updates the one with that email, and adds them to the list you pick.",
      "It fills FIRSTNAME and LASTNAME, the two attributes every Brevo account has.",
      "A fill without an email isn't sent.",
      retry("Brevo"),
    ],
    uses: ["Reads your account's company name.", "Lists your contact lists.", "Creates and updates contacts and adds them to a list."],
    never: ["Claritia's code never deletes Brevo contacts."],
    key: "an API key from Brevo",
    asks: "your Brevo API key",
    where: [SYNC, INTEGRATIONS],
  },
  kit: {
    about:
      "Kit (once ConvertKit) is an email marketing platform for creators. People join through Kit forms, and tags decide which emails they get.",
    does: [
      "Only people who can get marketing email are sent; a fill without consent is skipped and says why.",
      "Each fill subscribes the person through the Kit form you pick in the Sync tab, with their first name.",
      "Each tag you add is found by name or created in Kit, then added to the subscriber.",
      "A fill without an email isn't sent.",
      retry("Kit"),
    ],
    uses: ["Reads your account's name and email.", "Lists your forms and tags.", "Subscribes people to a form and creates tags."],
    never: ["Claritia's code never unsubscribes or deletes anyone in Kit."],
    key: "the API secret from Kit",
    where: [SYNC, INTEGRATIONS],
  },
  mailerlite: {
    about:
      "MailerLite is an email marketing tool for newsletters, landing pages and simple automations. Subscribers are sorted into groups.",
    does: [
      "Only people who can get marketing email are sent; a fill without consent is skipped and says why.",
      "Claritia upserts the subscriber by email into the group you pick in the Sync tab.",
      "It fills name, last name, country and phone.",
      "A fill without an email isn't sent.",
      retry("MailerLite"),
    ],
    uses: ["Checks the key by reading one subscriber.", "Lists your groups.", "Creates and updates subscribers and adds them to a group."],
    never: ["Claritia's code never deletes MailerLite subscribers."],
    key: "an API token from MailerLite",
    asks: "your MailerLite API token",
    where: [SYNC, INTEGRATIONS],
  },

  // Sheets and databases --------------------------------------------------------------------------------------
  google_sheets: {
    about:
      "Google Sheets is Google's free spreadsheet app that runs in the browser. Teams share sheets to keep simple lists, track leads and build quick reports.",
    does: [
      "Each fill adds one row. The first columns are Sent at, Fill ID and Form, then one column per question, named by its label.",
      "Where the fill came from (the channel, page, referrer, UTM tags and click ids) gets its own columns, only when the fill has them.",
      "In the form's Sync tab you make a new spreadsheet (one tab named Fills, with the header row frozen) or paste a spreadsheet's link; rows go to its first tab.",
      "A question added to the form later adds a column at the end of the header. Columns already there never move.",
      "Values go in as plain text, so an answer that starts with = stays text and never runs as a formula.",
      "If a try may have landed before a timeout, Claritia looks for the fill's ID in the Fill ID column first, so a fill never gets two rows.",
      "Fills without an email go too: every fill gets a row.",
      retry("Google Sheets"),
      linked("Google Sheets"),
    ],
    uses: ["Reads your Google account's email, for the card.", "Creates a spreadsheet when you ask for a new one.", "Reads and writes the header row, reads the Fill ID column, and appends rows, only in the spreadsheet the form uses."],
    never: ["Claritia's code never lists your other spreadsheets, and never deletes rows."],
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  airtable: {
    about:
      "Airtable is a spreadsheet and a database in one. Teams build bases of linked tables with field types like dates, choices and files, then add views and automations.",
    does: [
      "Each fill adds one record to the table you pick in the form's Sync tab, from the bases you can edit.",
      "Fields are Sent at, Fill ID, Form and one per question by its label. A field the table doesn't have yet is added as long text.",
      "Values are typecast, so Airtable fits an answer into a choice or date field when it can.",
      "If a try may have landed already, Claritia looks the Fill ID up first, so a fill never makes two records.",
      retry("Airtable"),
      linked("Airtable"),
    ],
    uses: ["Reads your Airtable user's email.", "Lists your bases and tables (up to 25 bases you can edit).", "Adds fields to the picked table, searches it by Fill ID, and creates records."],
    never: ["Claritia's code never deletes records, fields or tables."],
    key: "a personal access token from Airtable with data.records:read, data.records:write, schema.bases:read and schema.bases:write, and the bases added to it",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  excel: {
    about:
      "Excel Online is Microsoft's Excel in the browser. Workbooks live in OneDrive or SharePoint, so a team can open and edit the same file together.",
    does: [
      "In the form's Sync tab you pick a workbook (Claritia searches your OneDrive for .xlsx files) or paste a workbook's link from Excel's Share button.",
      "The first fill adds a sheet named Claritia fills with a table named ClaritiaFills. Your own sheets are never touched.",
      "Each fill adds a row to that table with Sent at, Fill ID, Form and a column per question. A new question adds a column at the end.",
      "Rows go in with the table's own add, so two fills at the same moment never overwrite each other.",
      "An answer that starts with =, +, - or @ is saved with Excel's text mark, so it never runs as a formula.",
      "If a try may have landed already, Claritia looks for the fill's ID first, so a fill never gets two rows.",
      retry("Excel"),
      linked("Excel"),
    ],
    uses: ["Reads your Microsoft account's email.", "Searches your OneDrive for workbooks, and opens a workbook from its share link.", "Adds one sheet and one table to the workbook you pick, adds columns to that table and adds rows."],
    never: ["Claritia's code never edits your other sheets, and never deletes rows."],
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  notion: {
    about:
      "Notion is a workspace for notes, docs, wikis and databases. A Notion database is a table where each row is a page with properties.",
    does: [
      "Each fill adds a page to the database you pick in the form's Sync tab, from the databases shared with Claritia.",
      "The page's title is the person's email or name, else the form and the time.",
      "Each answer goes to the property named like its question, in that property's type: email, phone, link, number, checkbox, select, multi-select or date. One that can't fit is left out.",
      "A property the database doesn't have yet (Sent at, Fill ID, Form or a question) is added as text.",
      "If a try may have landed already, Claritia looks the Fill ID up first, so a fill never makes two pages.",
      retry("Notion"),
      linked("Notion"),
    ],
    uses: ["Reads the connection's workspace name.", "Lists databases shared with Claritia.", "Adds properties to the picked database, queries it by Fill ID, and creates pages in it."],
    never: ["Claritia's code never deletes or archives pages."],
    key: "an integration secret from Notion, with the database shared with the integration",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  postgres: {
    about:
      "PostgreSQL is a popular open-source database. Teams run it themselves or on a cloud host, and keep their own apps' data in its tables.",
    does: [
      "Each fill adds a row to a table you name in the form's Sync tab (it starts as the form's name plus _fills).",
      "If the table isn't there, Claritia makes it with fill_id as its key, then sent_at and form.",
      "Each question adds a text column named from its label (Work email becomes work_email). Columns you added or changed stay as they are.",
      "A fill's row is keyed by its fill_id, so a delivery that runs again after a timeout adds nothing.",
      "Values are bound by the database driver and never pasted into the SQL; table and column names are checked to letters, digits and _.",
      retry("PostgreSQL"),
    ],
    uses: ["Runs select 1 at connect to check the details.", "Creates its table if missing, reads that table's column names, adds text columns to it and inserts rows."],
    never: ["Claritia's code never updates or deletes rows, and never touches tables other than the one you name."],
    key: "the host, port, database, user and password of a database user; the connect form shows a grant you can run to make one",
    where: [SYNC, INTEGRATIONS],
  },
  mysql: {
    about:
      "MySQL is a popular open-source database. It runs behind many websites and apps, on a team's own server or a cloud host.",
    does: [
      "Each fill adds a row to a table you name in the form's Sync tab.",
      "If the table isn't there, Claritia makes it (utf8mb4) with fill_id as its primary key, then sent_at and form.",
      "Each question adds a text column named from its label. Your own columns stay as they are.",
      "A fill's row is keyed by fill_id, so a retry after a timeout never adds a second row.",
      "Values are bound by the driver, never pasted into the SQL.",
      retry("MySQL"),
    ],
    uses: ["Runs select 1 at connect to check the details.", "Creates its table, reads its columns, adds columns and inserts rows, over a TLS connection."],
    never: ["Claritia's code never updates or deletes rows, and never touches tables other than the one you name."],
    key: "the host, port, database, user and password of a database user; the connect form shows a grant you can run to make one",
    where: [SYNC, INTEGRATIONS],
  },

  // Tasks and tickets -----------------------------------------------------------------------------------------
  linear: {
    about:
      "Linear is an issue tracker for software teams. Work is split into teams, and each issue moves through a team's workflow from backlog to done.",
    does: [
      "Each fill opens one issue in the Linear team you pick in the form's Sync tab.",
      "The title is the form and the person, with the fill's short id: Book a demo: Ada Lovelace (#1a2b3c4d).",
      "The description lists every answer with its question in bold, then the Fill ID and an Open in Claritia link.",
      "If a try may have landed already, Claritia searches that team's issues for the Fill ID first, so a fill never makes two issues.",
      "If the team is gone, the fill fails with a note to pick another one.",
      retry("Linear"),
      linked("Linear"),
    ],
    uses: ["Reads your organization's name and lists your teams.", "Searches issues and creates issues."],
    never: ["Claritia's code never edits or closes existing issues."],
    key: "a personal API key from Linear",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  trello: {
    about:
      "Trello organizes work on boards. Each board has lists, and each list has cards you drag along as work moves forward.",
    does: [
      "Each fill adds a card at the top of the list you pick (shown as Board / List) in the form's Sync tab.",
      "The card's name is the form and the person with the fill's short id; its description has every answer, the Fill ID and a link back to Claritia.",
      "If a try may have landed already, Claritia checks that list's cards for the Fill ID first, so a fill never makes two cards.",
      retry("Trello"),
      linked("Trello"),
    ],
    uses: ["Reads your name.", "Lists your open boards and their lists.", "Reads the cards in the picked list and creates cards."],
    never: ["Claritia's code never moves, archives or deletes cards."],
    key: "an API key and a token from Trello",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  clickup: {
    about:
      "ClickUp is an all-in-one app for tasks, docs and projects. Work is nested in workspaces, spaces, folders and lists.",
    does: [
      "Each fill makes a task in the list you pick in the form's Sync tab (Space / Folder / List).",
      "The task's name is the form and the person with the fill's short id; its description has every answer in Markdown, the Fill ID and a link back.",
      "If a try may have landed already, Claritia looks for a task with that short id in the list (closed ones too), so a fill never makes two tasks.",
      retry("ClickUp"),
      linked("ClickUp"),
    ],
    uses: ["Reads your user name or email.", "Lists workspaces, spaces, folders and lists (up to 5 workspaces and 20 spaces each).", "Reads the picked list's tasks and creates tasks."],
    never: ["Claritia's code never edits or deletes existing tasks."],
    key: "a personal API token from ClickUp",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  monday_work: {
    about:
      "monday.com is a work platform for projects, tasks and boards. Each board has items in rows and details in columns, and teams build their own workflows on it.",
    does: [
      "Each fill adds an item to the board you pick in the form's Sync tab, named after the form and the person with the fill's short id.",
      "Every answer goes into the item's first update, with the Fill ID and a link back to Claritia.",
      "If a try may have landed already, Claritia looks for an item with that name first, so a fill never makes two items.",
      retry("monday.com"),
      linked("monday.com"),
    ],
    uses: ["Reads your account's name and lists your active boards.", "Finds items by name, creates items and adds an update to them."],
    never: ["Claritia's code never edits or deletes existing items."],
    key: "an API token from monday.com",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  smartsuite: {
    about:
      "SmartSuite is a work platform for projects, processes and data. Teams build tables (called apps) for anything from tasks to client records.",
    does: [
      "Each fill adds a record to the table you pick in the form's Sync tab, titled with the form, the person and the fill's short id.",
      "Every answer, the Fill ID and a link back go into the table's first long text field.",
      "If a try may have landed already, Claritia looks for a record with that title first, so a fill never makes two.",
      retry("SmartSuite"),
    ],
    uses: ["Lists the tables in your workspace and reads the picked table's fields.", "Searches records by title and creates records."],
    never: ["Claritia's code never edits or deletes existing records."],
    key: "an API key and your workspace ID from SmartSuite",
    where: [SYNC, INTEGRATIONS],
  },
  zendesk: {
    about:
      "Zendesk is a help desk for customer support. Requests come in as tickets that agents answer, assign to groups and solve.",
    does: [
      "Each fill opens a ticket with the form and the person as its subject and every answer as its first comment.",
      "The person who filled the form is the requester (their email and name), so replies reach them.",
      "In the form's Sync tab you pick a group for the tickets, or No group.",
      "The fill's id is the ticket's external id, so a try after a timeout finds the ticket instead of opening a second one.",
      retry("Zendesk"),
      linked("Zendesk"),
    ],
    uses: ["Reads the agent you connected with.", "Lists your groups.", "Finds tickets by external id and creates tickets."],
    never: ["Claritia's code never edits, solves or deletes tickets."],
    key: "your Zendesk address, an agent's email and an API token from Zendesk",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  freshdesk: {
    about:
      "Freshdesk is the help desk from Freshworks. Customer emails, chats and forms become tickets that agents work through.",
    does: [
      "Each fill opens a ticket from the person's email (and name), as Open with Low priority, with every answer in its description.",
      "Freshdesk needs the person's email to make a ticket, so a fill without one fails and says so.",
      "Pick a group in the form's Sync tab, or No group.",
      "Each ticket carries a claritia tag with the fill's short id, so a try after a timeout finds it instead of opening a second one.",
      retry("Freshdesk"),
      linked("Freshdesk"),
    ],
    uses: ["Lists your groups (this also checks the key).", "Searches tickets by tag and creates tickets."],
    never: ["Claritia's code never edits, closes or deletes tickets."],
    key: "your Freshdesk address (like acme.freshdesk.com) and an API key from Freshdesk",
    asks: "your Freshdesk API key and account address",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },
  intercom: {
    about:
      "Intercom is a customer messaging platform. Teams use its inbox, chat and help center to talk with customers and leads.",
    does: [
      "Each fill opens a conversation in your Intercom inbox, from the person who filled the form, with every answer in it.",
      "Claritia finds the person in Intercom by email, or adds them as a lead first.",
      "Intercom needs an email for this, so a fill without one fails and says so.",
      "If a try may have landed already, Claritia searches conversations for the fill's id first, so a fill never opens two.",
      retry("Intercom"),
      linked("Intercom"),
    ],
    uses: ["Reads your workspace's name and id.", "Searches contacts by email and creates leads.", "Searches conversations and creates conversations."],
    never: ["Claritia's code never closes or deletes conversations or contacts."],
    key: "an access token from Intercom",
    where: [SYNC, SUBMISSIONS, INTEGRATIONS],
  },

  // Documents and files ---------------------------------------------------------------------------------------
  google_docs: {
    about:
      "Google Docs is Google's word processor in the browser. Teams write, share and comment on documents together, and keep them in Google Drive.",
    does: [
      "In the form's Sync tab you paste the link of a template doc. Each fill makes a new doc from it, named after the form and the person.",
      "Tags in the template are filled in: {{Question label}} with that answer, plus {{email}}, {{name}} and {{date}}.",
      "Bold, italic, underline and heading styles carry over. Tables, pictures, lists and colors in the template don't.",
      "A tag with no answer is left blank, and the fill notes which tags were blank.",
      "Each new doc is marked with the fill's id, so a try after a timeout finds that doc instead of making a second.",
      retry("Google Docs"),
      linked("Google Docs"),
    ],
    uses: ["Reads your Google account's email.", "Reads the template doc you paste.", "Creates a new doc per fill and writes its text, and marks it in Drive with the fill's id."],
    never: ["Claritia's code never edits your template and never deletes docs."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  docusign: {
    about:
      "DocuSign is the e-signature tool many businesses use to send contracts and forms to sign. Templates hold a document with places for each signer to fill in.",
    does: [
      "Each fill sends an envelope from the DocuSign template you pick in the form's Sync tab, to the person who filled the form.",
      "The person is the template's first signer role. Text fields whose labels match a question's label are filled with the answer.",
      "The fill needs an email to send to; without one it fails and says so. A template with no signer role fails with a note to add one.",
      "Each envelope carries a hidden claritia_fill field with the fill's id, so a try after a timeout finds it instead of sending twice.",
      retry("DocuSign"),
      linked("DocuSign"),
    ],
    uses: ["Reads your default DocuSign account.", "Lists your templates and reads a template's signer roles.", "Creates and sends envelopes, and searches envelopes by the claritia_fill field."],
    never: ["Claritia's code never voids or deletes envelopes."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  pandadoc: {
    about:
      "PandaDoc makes proposals, quotes and contracts from templates, and collects e-signatures on them. Sales teams use it to send a priced document in minutes.",
    does: [
      "Each fill makes a document from the PandaDoc template you pick, with the person as its recipient (in the template's first role).",
      "Each answer fills the template's token named like its question.",
      "PandaDoc takes a few seconds to make the draft, so Claritia checks back every 5 seconds until it's ready, then sends it.",
      "The fill needs an email; without one it fails and says so.",
      "Each document carries the fill's id in its metadata, so a try after a timeout finds it instead of sending twice.",
      retry("PandaDoc"),
      linked("PandaDoc"),
    ],
    uses: ["Reads your member profile and workspace name.", "Lists your templates and reads a template's roles.", "Creates documents, reads their status and sends them."],
    never: ["Claritia's code never deletes documents."],
    key: "an API key from PandaDoc",
    asks: "your PandaDoc API key",
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  google_drive: {
    about:
      "Google Drive is Google's cloud storage for files and folders. You can share a folder with your team and open files from any device.",
    does: [
      "Each fill's uploaded files are copied into Drive, in a folder named after the fill: the form, the day and a short id (Book a demo 2026-11-06 1a2b3c4d).",
      "In the form's Sync tab you make a new folder for the form; each fill's folder goes inside it.",
      "Files over 4 MB go up in parts, and a part that fails is sent again from where Drive says it stopped.",
      "A run again looks for the folder and each file by name first, so nothing is copied twice.",
      "A fill without files is skipped.",
      retry("Google Drive"),
      linked("Google Drive"),
    ],
    uses: ["Reads your Google account's email.", "Creates folders and uploads files."],
    never: ["Claritia's code only works inside folders it made, and never deletes or downloads files."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  onedrive: {
    about:
      "OneDrive is Microsoft's cloud storage for files and folders. It comes with Microsoft 365, and teams share folders from it or from SharePoint.",
    does: [
      "Each fill's uploaded files are copied into a folder named after the fill, inside the folder you pick or make in the form's Sync tab.",
      "Files over 4 MB go up in an upload session, in parts, resumed from where OneDrive says it stopped.",
      "A run again finds the fill's folder and files by name, so nothing is copied twice; a file with the same name is never overwritten.",
      "A fill without files is skipped.",
      retry("OneDrive"),
      linked("OneDrive"),
    ],
    uses: ["Reads your Microsoft account's email.", "Lists the folders at the top of your OneDrive, for the picker.", "Creates folders and uploads files inside the folder the form uses."],
    never: ["Claritia's code never deletes or overwrites files, and never downloads them."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  dropbox: {
    about:
      "Dropbox is cloud storage for keeping and sharing files and folders. Teams use shared folders so everyone has the same files.",
    does: [
      "Each fill's uploaded files are copied into a folder named after the fill, inside the folder you pick or make in the form's Sync tab.",
      "Files over 4 MB go up in an upload session, in parts.",
      "A run again checks whether each file is already there by its path, so nothing is copied twice; nothing is renamed or overwritten.",
      "A fill without files is skipped.",
      retry("Dropbox"),
      linked("Dropbox"),
    ],
    uses: ["Reads your account's name or email.", "Lists the folders at the top of your Dropbox.", "Creates folders, checks whether a file exists, and uploads files."],
    never: ["Claritia's code never downloads, moves or deletes your files."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  box: {
    about:
      "Box is cloud storage and file sharing for businesses. Companies use it to keep files secure and share them with people inside and outside the team.",
    does: [
      "Each fill's uploaded files are copied into a folder named after the fill, inside the folder you pick or make in the form's Sync tab.",
      "If the fill's folder is already there, Box hands back its id and Claritia uses it, so a run again never makes a second folder.",
      "Each file goes up in one piece (form uploads are at most 20 MB); one already there by name isn't copied again.",
      "A fill without files is skipped.",
      retry("Box"),
      linked("Box"),
    ],
    uses: ["Reads your Box user.", "Lists the folders at the top of your Box.", "Creates folders and uploads files."],
    never: ["Claritia's code never deletes or downloads your files."],
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },
  s3: {
    about:
      "Amazon S3 is Amazon Web Services' storage for files of any size. Files live in buckets, and developers use it to keep uploads, backups and data.",
    does: [
      "Each fill's uploaded files are copied into your bucket, under the folder you named at connect, in a folder named after the fill.",
      "Before each file, Claritia checks whether it's already there, so a run again copies nothing twice.",
      "Files over 8 MB go up as a multipart upload; a failed part is sent again.",
      "A fill without files is skipped.",
      retry("Amazon S3"),
      linked("Amazon S3"),
    ],
    uses: ["Checks the bucket is reachable at connect.", "Checks whether an object exists, and uploads objects, under the folder you named."],
    never: ["Claritia's code never lists, reads back or deletes objects."],
    key: "the bucket's name and region, an optional folder in it, and an access key ID and secret access key that can write to it (s3:PutObject, s3:GetObject and s3:ListBucket on the bucket)",
    where: [SYNC, SEND_TO, SUBMISSIONS, INTEGRATIONS],
  },

  // Messages and texts ----------------------------------------------------------------------------------------
  teams: {
    about:
      "Microsoft Teams is Microsoft's app for work chat, calls and meetings. Teams are split into channels where people post and reply.",
    does: [
      "Each fill posts a message to the channel you pick in the form's Sync tab: New fill on the form with the person's name, then the answers, and a link to the form in Claritia.",
      "A workflow's Teams or Discord step posts your text to a channel, with the person's name, email, company and owner.",
      "Test fills are marked [Test].",
      "If the channel was deleted, the fill or step fails with a note to pick another.",
      "A post that may have gone out before a crash isn't sent again, so a channel never gets the same alert twice.",
    ],
    uses: ["Reads your Microsoft account's email.", "Lists the teams you belong to and their channels.", "Posts messages to the picked channel, as you."],
    never: ["Claritia's code never reads messages in your channels."],
    where: [SYNC, SEND_TO, "Workflows, the Teams or Discord step", INTEGRATIONS],
  },
  discord: {
    about:
      "Discord is a chat app for communities and teams, with servers split into text and voice channels. Many startups and online groups run on it.",
    does: [
      "Each connection posts to one channel. Each fill posts New fill on the form with the person's name and the answers, and a link to the form.",
      "A workflow's Teams or Discord step posts your text to that channel, with the person's name, email, company and owner.",
      "If Discord asks Claritia to slow down, the post waits as long as Discord says.",
      "If the channel's webhook was deleted, the fill or step fails with a note to connect the channel again.",
    ],
    uses: ["Posts messages through the channel's webhook.", "Reads the webhook's channel and name, for the card."],
    never: ["Claritia's code only posts through the channel's webhook; it never reads messages."],
    key: "a channel's webhook address (Channel settings › Integrations › Webhooks)",
    where: [SYNC, SEND_TO, "Workflows, the Teams or Discord step", INTEGRATIONS],
  },
  twilio: {
    about:
      "Twilio is a platform for sending text messages, WhatsApp messages and making calls from code. Businesses rent phone numbers from it and pay per message.",
    does: [
      "A workflow's Text message step sends from your Twilio number or Messaging Service instead of Claritia's own number.",
      "A workflow's WhatsApp step sends your approved WhatsApp templates, with their variables filled in; WhatsApp needs your own Twilio.",
      "At send time Claritia checks again: the person gave text consent, hasn't replied STOP to that number, and a reminder's meeting is still on at the same time.",
      "Replies STOP, START and HELP are handled when you set the number's incoming address to https://app.tryclaritia.com/api/texts/inbound. Twilio's delivery reports update each text's status.",
      "If Twilio is busy or down, a text is tried once more. After that, or after a refusal that won't change, the step's fallback email goes instead when it has one.",
      "A text that got no answer is marked unknown and never sent again, because Twilio has no way to refuse a repeat.",
    ],
    uses: ["Reads your account's name at connect.", "Sends texts and WhatsApp messages from your sender.", "Checks the signature on Twilio's replies and delivery reports with your auth token."],
    never: ["Claritia's code never buys or releases numbers."],
    key: "your Account SID (starts with AC), auth token, and a phone number or Messaging Service SID, plus a WhatsApp sender if you use WhatsApp",
    where: ["Workflows, the Text message and WhatsApp steps", "Booking pages, the Text consent question", INTEGRATIONS],
  },

  // Forms and meetings coming in -----------------------------------------------------------------------------
  typeform: {
    about:
      "Typeform is a form builder known for showing one question at a time, like a conversation. Teams use it for surveys, quizzes and lead forms.",
    does: [
      "Each Typeform response becomes a contact in Claritia, matched by the email answer, so the same person twice stays one contact.",
      "Email and phone answers land in those fields. Other answers are matched by their question's title (Company, Job title and so on), and hidden fields come along.",
      "The same response sent twice is kept once, by Typeform's response token.",
      "Contacts from Typeform show in Emails › Audiences.",
    ],
    uses: ["Receives the responses Typeform posts to your webhook address; nothing is read from your Typeform account."],
    never: ["Claritia can't read, change or delete your typeforms."],
    where: [INTEGRATIONS, "Typeform's webhook settings, where you paste the address", "Emails › Audiences, where the contacts show"],
  },
  tally: {
    about:
      "Tally is a simple form builder that works like writing a doc. It's free for most uses, so many small teams and creators pick it.",
    does: [
      "Each Tally submission becomes a contact in Claritia, matched by the email answer.",
      "Email and phone answers land in those fields; choices come over as their text, and other answers are matched by their label.",
      "The same submission sent twice is kept once, by Tally's event id.",
      "Contacts from Tally show in Emails › Audiences.",
    ],
    uses: ["Receives the submissions Tally posts to your webhook address; nothing is read from your Tally account."],
    never: ["Claritia can't read, change or delete your Tally forms."],
    where: [INTEGRATIONS, "Tally's webhook settings for the form, where you paste the address", "Emails › Audiences"],
  },
  webflow: {
    about:
      "Webflow is a website builder for designers, with hosting and a CMS built in. Its native forms collect sign-ups and contact requests on the site.",
    does: [
      "Each Webflow form submission becomes a contact in Claritia, matched by its email field.",
      "Other fields are matched by their names (Name, Company, Phone and so on).",
      "The same submission sent twice is kept once, by Webflow's submission id.",
      "Contacts from Webflow show in Emails › Audiences.",
    ],
    uses: ["Receives the form submissions Webflow posts to your webhook address; nothing is read from your Webflow site."],
    never: ["Claritia can't change your Webflow site."],
    where: [INTEGRATIONS, "Webflow's webhook settings for the site, where you paste the address", "Emails › Audiences"],
  },
  calendly: {
    about:
      "Calendly is a scheduling tool: you share a link, and people pick a time that's free on your calendar. Sales and recruiting teams use it to book calls without back-and-forth email.",
    does: [
      "Each new Calendly booking (invitee created) becomes a contact in Claritia, with name, email, time zone and the booking questions' answers.",
      "When a Claritia form sent the person to Calendly, the booking is linked to their fill by the tracking code the link carried; otherwise by the same email on a fill in the last 7 days.",
      "A booking linked by its tracking code goes into the contact's history as a meeting booked, with the form it came from.",
      "The same booking sent twice is kept once.",
    ],
    uses: ["Receives the bookings Calendly posts to your webhook address; nothing is read from your Calendly account."],
    never: ["Claritia can't book, move or cancel your Calendly meetings."],
    where: [INTEGRATIONS, "Form Studio › On submission, booking on Calendly after the form", "Emails › Audiences"],
  },
  calcom: {
    about:
      "Cal.com is an open-source scheduling tool. Like Calendly, people pick a free time from a link; teams can also host it themselves.",
    does: [
      "Each new Cal.com booking (booking created) becomes a contact in Claritia, with the first attendee's name, email and time zone and the booking form's answers by label.",
      "When a Claritia form sent the person to Cal.com, the booking is linked to their fill by the tracking code in its metadata; otherwise by the same email on a fill in the last 7 days.",
      "A booking linked by its tracking code goes into the contact's history as a meeting booked.",
      "The same booking sent twice is kept once, by its uid.",
    ],
    uses: ["Receives the bookings Cal.com posts to your webhook address; nothing is read from your Cal.com account."],
    never: ["Claritia can't book, move or cancel your Cal.com bookings."],
    where: [INTEGRATIONS, "Form Studio › On submission, booking on Cal.com after the form", "Emails › Audiences"],
  },

  // Meetings and payments ------------------------------------------------------------------------------------
  webex: {
    about:
      "Webex is Cisco's video meeting app. Many large companies use it for calls, webinars and team meetings.",
    does: [
      "Pick Webex as a meeting type's location, and each booking gets its own Webex meeting with the meeting's title and time.",
      "When the booking moves, the Webex meeting moves with it. When it's canceled, the Webex meeting is deleted.",
      "Claritia keeps the meeting's id the moment it's made, so a retry never makes a second Webex meeting.",
      "Auto-recording is off and attendees can't make themselves co-hosts.",
    ],
    uses: ["Reads your Webex profile's email.", "Creates, updates and deletes the Webex meetings Claritia makes for bookings."],
    never: ["Claritia's code never changes or deletes Webex meetings it didn't make."],
    where: ["Meetings › Meeting types › Location", INTEGRATIONS],
  },
  whereby: {
    about:
      "Whereby is a video meeting app that runs in the browser, with no download for guests. Its Embedded API makes a room for each meeting.",
    does: [
      "Pick Whereby as a meeting type's location, and each booking gets its own room, open until an hour after the meeting ends so a long call isn't cut off.",
      "Whereby rooms end at a set time, so when a booking moves, Claritia makes a new room and removes the old one.",
      "When a booking is canceled, its room is deleted.",
    ],
    uses: ["Checks the key by reading one meeting.", "Creates and deletes the rooms Claritia makes for bookings."],
    never: ["Claritia's code never touches rooms it didn't make."],
    key: "an Embedded API key from Whereby › Settings › API",
    where: ["Meetings › Meeting types › Location", INTEGRATIONS],
  },
  paypal: {
    about:
      "PayPal is an online payments platform used around the world. Buyers can pay with a PayPal balance or a card, and the money goes to the seller's PayPal account.",
    does: [
      "Pick PayPal under Paid with on a paid meeting type, or in a form's payment block, and guests pay on PayPal's checkout.",
      "The money goes straight to your PayPal account; the fees are yours, and Claritia never holds the money.",
      "The amount always comes from Claritia's server (the meeting type's price or the form's), never from the page.",
      "A payment counts only once Claritia has read it back from PayPal: never from the page coming back, never from a webhook's words alone.",
      "A paid meeting holds its time while the guest pays. If the time was taken meanwhile, the payment is refunded at once, and a host's cancel refunds it in full.",
      "With the Webhook ID pasted, PayPal's webhooks are checked with PayPal before they count; without it, payments still count when the guest comes back.",
    ],
    uses: ["Creates and captures checkout orders on your app.", "Reads orders back, refunds captures, and asks PayPal to verify webhooks."],
    key: "a REST app's Client ID and Secret from developer.paypal.com, and the Webhook ID of the app's webhook (Mode: live or sandbox)",
    where: ["Meetings › Meeting types › Paid meeting › Paid with", "Form Studio › a payment block's settings", INTEGRATIONS],
  },
  square: {
    about:
      "Square takes payments online and in person, with card readers and point-of-sale apps. Many shops, salons and studios use it.",
    does: [
      "Pick Square under Paid with on a paid meeting type, or in a form's payment block, and guests pay on a Square payment link.",
      "The money goes to your Square location; Claritia never holds it.",
      "The amount always comes from Claritia's server, and a payment counts only once Claritia reads the order and its payment back from Square.",
      "Square's payment.updated webhook is checked against your signature key before Claritia reads the payment back.",
      "If a meeting's time was taken while the guest paid, or the host cancels, the payment is refunded in full, once.",
    ],
    uses: ["Reads your location's name.", "Creates payment links with their orders, reads orders and payments, and makes refunds."],
    key: "an access token and a location ID from your app at developer.squareup.com, and its webhook signature key (Environment: production or sandbox)",
    where: ["Meetings › Meeting types › Paid meeting › Paid with", "Form Studio › a payment block's settings", INTEGRATIONS],
  },
  stripe: {
    about:
      "Stripe is a payments platform for taking cards online. Businesses of every size use it, and it pays out to your bank account.",
    does: [
      "Paid meeting types: guests pay on Stripe Checkout when they book, with cards or Link. The time is held for 10 minutes while they pay.",
      "The meeting is booked once Stripe says it's paid. If the time was taken meanwhile, the meeting is canceled and the payment refunded at once.",
      "A form's payment block opens Stripe Checkout after the form, with promotion codes when you turn them on.",
      "Guests pay your Stripe account directly; Stripe's fees are yours, and Claritia never holds the money.",
      "When a host cancels a paid meeting, Claritia refunds it in full on your account. Each refund carries a key, so the same event twice never refunds twice.",
      "Until Stripe has what it needs from you, the card says Finish on Stripe.",
    ],
    uses: ["Creates Checkout sessions and refunds on your account.", "Reads your account's state after you come back from Stripe.", "Gets your account's checkout events through Claritia's Connect webhook."],
    never: ["Claritia's code only makes Checkout sessions and refunds on your account; it never makes payouts or transfers."],
    where: ["Meetings › Meeting types › Paid meeting", "Form Studio › a payment block", INTEGRATIONS],
  },

  // Analytics and ads ----------------------------------------------------------------------------------------
  segment: {
    about:
      "Segment collects customer data in one place and sends it on to your other tools. Teams send events to Segment once instead of to every tool.",
    does: [
      "Each fill goes to Segment as a Form Submitted track event, with the person's email as the user id (or anon- and the fill's id when there's no email).",
      "The event's properties are the form's id and name, every answer by its question, and where the fill came from (UTM tags, page, referrer, gclid and fbclid).",
      "An identify call sets the person's email, name, title, company and country as traits.",
      "A workflow's Analytics event step sends the event you name, with the workflow's id and name.",
      "The fill's id is the event's messageId, so a retry after a lost answer counts once.",
      testFills,
    ],
    uses: ["Sends track and identify calls to your source (in the US or EU region)."],
    never: ["Claritia's code only sends to Segment; it never reads from it."],
    key: "the write key from an HTTP API source's settings, and its region (us or eu)",
    where: [SYNC, SEND_TO, "Workflows, the Analytics event step", INTEGRATIONS],
  },
  posthog: {
    about:
      "PostHog is a product analytics platform with session replays, feature flags and A/B tests. Product teams use it to see what people do in their apps.",
    does: [
      "Each fill goes to PostHog as a Form Submitted event, with the person's email as the distinct id.",
      "The event carries the form, every answer by its question and where the fill came from, and sets the person's email, name, title and company on their profile.",
      "A workflow's Analytics event step sends the event you name.",
      "Each event's uuid is made from the fill's id, so PostHog keeps a retry once.",
      testFills,
    ],
    uses: ["Sends events to your project (on PostHog's US cloud, or the address you give)."],
    never: ["Claritia's code only sends to PostHog; it never reads from it."],
    key: "the project API key from PostHog's Project settings, and its address (like https://eu.i.posthog.com)",
    where: [SYNC, SEND_TO, "Workflows, the Analytics event step", INTEGRATIONS],
  },
  mixpanel: {
    about:
      "Mixpanel is product analytics for tracking what users do. Teams use it to build funnels, retention charts and reports from events.",
    does: [
      "Each fill goes to Mixpanel as a Form Submitted event, with the person's email as the distinct id and every answer as a property.",
      "A profile update sets the person's email, name, title and company.",
      "A workflow's Analytics event step sends the event you name.",
      "Each event's $insert_id comes from the fill's id, so Mixpanel drops a repeat.",
      "Claritia sends in strict mode, so an event Mixpanel didn't take fails the delivery with Mixpanel's reason instead of passing quietly.",
    ],
    uses: ["Sends events and profile updates to your project (US or EU)."],
    never: ["Claritia's code only sends to Mixpanel; it never reads from it."],
    key: "the project token from Mixpanel's Project settings, and its region (us or eu)",
    where: [SYNC, SEND_TO, "Workflows, the Analytics event step", INTEGRATIONS],
  },
  amplitude: {
    about:
      "Amplitude is product analytics for understanding user behavior. Teams use it to see which steps people take, where they drop off and what brings them back.",
    does: [
      "Each fill goes to Amplitude as a Form Submitted event, with the person's email as the user id and every answer as an event property.",
      "The person's email, name, title and company are set as user properties.",
      "A workflow's Analytics event step sends the event you name.",
      "Each event's insert_id comes from the fill's id, so Amplitude drops a repeat.",
    ],
    uses: ["Sends events to your project through the HTTP API (US or EU)."],
    never: ["Claritia's code only sends to Amplitude; it never reads from it."],
    key: "the API key from Amplitude's Project settings, and its region (us or eu)",
    where: [SYNC, SEND_TO, "Workflows, the Analytics event step", INTEGRATIONS],
  },
  meta_ads: {
    about:
      "Meta Ads runs ads on Facebook, Instagram and Messenger. Its Conversions API lets a website tell Meta about sign-ups from its server, so ads are measured even when the browser blocks tracking.",
    does: [
      "With the form's Meta Pixel ID and Conversions API turned on, each fill is sent from Claritia's server as a Lead event, and a booking from that fill as Schedule.",
      "Each event uses the same event id as the browser pixel, so Meta counts it once.",
      "The person's email, phone, first and last name, country and Claritia id go hashed (SHA-256), with the browser's IP, user agent, Meta cookies and the page.",
      "Events go only when the visitor's consent allows ad events (the browser's Consent Mode, or no in strict regions).",
    ],
    uses: ["Reads the token's user name at connect.", "Sends events to the pixel you name in the form's Tracking settings."],
    never: ["Claritia's code only sends events; it never changes ads, campaigns or budgets."],
    key: "a system user access token from Meta's Events Manager with access to the pixel",
    where: ["Form › Settings › Tracking › Conversions API", INTEGRATIONS],
  },
  google_ads: {
    about:
      "Google Ads runs ads on Google Search, YouTube and across the web. Offline conversions let a business tell Google which ad clicks became leads.",
    does: [
      "Turn on Offline conversions in a form's Tracking settings and pick the ad account and conversion action (an enabled one that takes uploaded clicks).",
      "Each fill that came from a Google ad click (it carries a gclid, gbraid or wbraid) is uploaded as a click conversion at the time of the fill.",
      "The fill's id is the conversion's order id, so Google drops a second upload of the same fill.",
      "Uploads go only when the visitor's consent allows ad events, and are marked as consented to ad user data.",
    ],
    uses: ["Lists the ad accounts you can reach and their conversion actions.", "Uploads click conversions to the account you pick."],
    never: ["Claritia's code never changes campaigns, ads or budgets."],
    where: ["Form › Settings › Tracking › Offline conversions", INTEGRATIONS],
  },

  // Automation apps -------------------------------------------------------------------------------------------
  zapier: {
    about:
      "Zapier connects thousands of apps with automations called Zaps. A Zap starts on an event in one app and does steps in others, with no code.",
    does: [
      "Triggers: New Fill (from every form or one form), New Booking, Booking Canceled and Lead Routed (when routing gives a lead an owner, or finds none).",
      "Search: Find Fill finds the latest fill from an email.",
      "Action: Add Contact to Workflow adds someone to a live workflow, making the contact if they're new.",
      "Each trigger is a hook Zapier adds on Claritia's Forms API; each delivery is signed with the hook's own secret.",
    ],
    uses: ["Zapier gets a workspace API key named Zapier when you allow it.", "With it, Zapier reaches this workspace's forms, fills, bookings and workflows through the Forms API (120 calls a minute)."],
    where: ["Zapier, where you add the Claritia app and sign in", "Claritia's approve screen", INTEGRATIONS],
  },
  make: {
    about:
      "Make (once Integromat) builds visual automations called scenarios. You drag apps onto a canvas and connect them, with branches and filters.",
    does: [
      "Instant triggers: Watch Fills, Watch Bookings, Watch Canceled Bookings and Watch Routed Leads.",
      "Search: Find Fills by email. Action: Add a Contact to a Workflow, which makes the contact if they're new.",
      "Pickers in Make list your forms and workflows.",
      "Each trigger is a hook Make adds on Claritia's Forms API, signed with its own secret.",
    ],
    uses: ["Make gets a workspace API key named Make when you allow it.", "With it, Make reaches this workspace's forms, fills, bookings and workflows through the Forms API."],
    where: ["Make, where you add the Claritia app and connect", "Claritia's approve screen", INTEGRATIONS],
  },
};

// Sign-in scopes ------------------------------------------------------------------------------------------------
// Claritia's own sign-in apps ask for exactly these (src/lib/sources/oauth.ts; the test keeps them equal).

export const OWN_SCOPES: Record<string, string[]> = {
  hubspot: ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.companies.read", "crm.lists.read", "crm.schemas.contacts.read", "crm.schemas.contacts.write"],
  salesforce: ["api", "refresh_token"],
  pipedrive: [],
  attio: [],
  mailchimp: [],
  google_sheets: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/userinfo.email"],
  google_ads: ["https://www.googleapis.com/auth/adwords", "https://www.googleapis.com/auth/userinfo.email"],
  airtable: ["data.records:read", "data.records:write", "schema.bases:read", "schema.bases:write", "user.email:read"],
  excel: ["offline_access", "User.Read", "Files.ReadWrite"],
  notion: [],
  zoho: ["ZohoCRM.modules.leads.ALL", "ZohoCRM.org.READ"],
  dynamics: ["offline_access", "User.Read", "https://globaldisco.crm.dynamics.com/user_impersonation"],
  gohighlevel: ["contacts.readonly", "contacts.write", "locations.readonly"],
  keap: ["full"],
  linear: ["read", "write", "issues:create"],
  clickup: [],
  google_docs: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"],
  docusign: ["signature"],
  teams: ["offline_access", "User.Read", "Team.ReadBasic.All", "Channel.ReadBasic.All", "ChannelMessage.Send"],
  discord: ["webhook.incoming"],
  google_drive: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"],
  onedrive: ["offline_access", "User.Read", "Files.ReadWrite"],
  dropbox: ["account_info.read", "files.metadata.read", "files.content.read", "files.content.write"],
  box: [],
  webex: ["meeting:schedules_write", "meeting:schedules_read", "spark:people_read"],
};

/** HubSpot's optional scopes: asked for, and granted only where the account allows. */
export const HUBSPOT_OPTIONAL = ["timeline.read", "timeline.write", "crm.objects.owners.read", "crm.objects.deals.read"];

/** Each scope in plain words. */
export const SCOPE_WORDS: Record<string, string> = {
  oauth: "Sign in to your HubSpot account (every HubSpot app asks for this).",
  "crm.objects.contacts.read": "Read contacts.",
  "crm.objects.contacts.write": "Create and update contacts.",
  "crm.objects.companies.read": "Read companies (asked for, not used by Claritia today).",
  "crm.lists.read": "Read lists (asked for, not used by Claritia today).",
  "crm.schemas.contacts.read": "Read the list of contact properties.",
  "crm.schemas.contacts.write": "Add contact properties (Claritia adds its three).",
  "timeline.read": "Optional: read timeline events (not used by Claritia today).",
  "timeline.write": "Optional: write timeline events (not used by Claritia today).",
  "crm.objects.owners.read": "Optional: read the list of HubSpot users who can own records (not used by Claritia today).",
  "crm.objects.deals.read": "Optional: read deals (not used by Claritia today).",
  api: "Use Salesforce's API as you: whatever your Salesforce user can see and change.",
  refresh_token: "Stay signed in, so fills keep going without you signing in again.",
  "https://www.googleapis.com/auth/spreadsheets": "See, edit, create and delete your Google Sheets spreadsheets (Google has no narrower Sheets permission; Claritia only opens the one the form uses).",
  "https://www.googleapis.com/auth/userinfo.email": "See your Google account's email address, shown on the card.",
  "https://www.googleapis.com/auth/adwords": "Manage your Google Ads accounts (Google's one Ads permission; Claritia lists accounts and conversion actions and uploads conversions).",
  "data.records:read": "Read records in the bases you add.",
  "data.records:write": "Create records in the bases you add.",
  "schema.bases:read": "Read the bases' tables and fields.",
  "schema.bases:write": "Add fields to a table.",
  "user.email:read": "See your Airtable email, shown on the card.",
  offline_access: "Stay signed in, so deliveries keep going without you.",
  "User.Read": "Sign you in and read your profile (name and email).",
  "Files.ReadWrite": "Read and write the files you can open in OneDrive (Microsoft's file permission; Claritia only works in the workbook or folder the form uses).",
  "ZohoCRM.modules.leads.ALL": "Read, create, update and delete Leads (Zoho's Leads permission; Claritia never deletes).",
  "ZohoCRM.org.READ": "Read your Zoho CRM organization's name and id.",
  "https://globaldisco.crm.dynamics.com/user_impersonation": "Use Dynamics 365 as you: find your environments, then read and write leads in one.",
  "contacts.readonly": "Read contacts in the sub-account.",
  "contacts.write": "Create and update contacts in the sub-account.",
  "locations.readonly": "Read the sub-account's name.",
  full: "Full access to your Keap account (Keap's only permission); Claritia only creates and updates contacts.",
  read: "Read your Linear workspace (teams and issues).",
  write: "Write to your Linear workspace.",
  "issues:create": "Create issues.",
  "https://www.googleapis.com/auth/documents": "See, edit, create and delete your Google Docs (needed to read the template you paste).",
  "https://www.googleapis.com/auth/drive.file": "See and edit only the Drive files and folders Claritia makes, or ones you open with it.",
  signature: "Create and send envelopes for signature, as you.",
  "Team.ReadBasic.All": "See the names of the teams you belong to.",
  "Channel.ReadBasic.All": "See the names of those teams' channels.",
  "ChannelMessage.Send": "Post messages to channels, as you.",
  "webhook.incoming": "Add one webhook to a channel you pick, in a server you manage.",
  "account_info.read": "Read your Dropbox account's name and email.",
  "files.metadata.read": "See the names of your files and folders.",
  "files.content.read": "Read the contents of your files (asked for by the app; Claritia's code never downloads).",
  "files.content.write": "Create folders and upload files.",
  "meeting:schedules_write": "Create, change and delete Webex meetings.",
  "meeting:schedules_read": "Read Webex meetings.",
  "spark:people_read": "Read your Webex profile (name and email).",
};

/** Sign-ins whose access is set on the app, not in the sign-in link. */
const NO_SCOPE: Record<string, string> = {
  pipedrive: "Pipedrive's sign-in shows the access on its own screen; it's set on Claritia's Pipedrive app, not in the link.",
  attio: "Attio's sign-in shows the access on its own screen; it's set on Claritia's Attio app.",
  mailchimp: "Mailchimp's sign-in has no permission levels: it covers the whole account. Claritia only makes the calls listed here.",
  notion: "On Notion's screen you pick which pages and databases Claritia can see; it sees nothing else.",
  clickup: "ClickUp's sign-in has no permission levels: you pick the workspaces Claritia can reach on ClickUp's screen.",
  box: "Box's sign-in uses the access set on Claritia's Box app (read and write files and folders).",
};

// Building an entry ---------------------------------------------------------------------------------------------

const AUTOMATION: Record<string, string> = { zapier: "Zapier", make: "Make" };

/** The tool's name. */
export const nameOf = (kind: string) => AUTOMATION[kind] ?? (kind === "stripe" ? "Stripe" : (entryOf(kind)?.label ?? kind));

/** How a tool connects on this server: `composio` is whether the kind signs in on Composio here. */
export function wayOf(kind: string, composio: boolean): Way {
  if (AUTOMATION[kind]) return "app";
  if (kind === "stripe") return "stripe";
  if (kind === "omniscient") return "omniscient";
  if (composio) return "composio";
  const e = entryOf(kind);
  if (e?.hook) return "hook";
  if (e?.oauth) return e.keys?.length ? "signin_or_key" : "signin";
  return "key";
}

const scopeLines = (kind: string) => {
  const s = OWN_SCOPES[kind] ?? [];
  if (!s.length) return [NO_SCOPE[kind] ?? `${nameOf(kind)}'s sign-in shows the access it asks for on its own screen.`];
  return [...s, ...(kind === "hubspot" ? HUBSPOT_OPTIONAL : [])].map((x) => SCOPE_WORDS[x] ?? x);
};

function accessOf(kind: string, b: Base, way: Way): string[] {
  const n = nameOf(kind);
  const out: string[] = [];
  if (way === "composio") {
    out.push(
      b.asks
        ? `Composio's page asks for ${b.asks}. Composio keeps it; Claritia never sees or stores it.`
        : `You sign in to ${n} on Composio's page, through Composio's own ${n} app. ${n}'s screen lists the exact access it asks for.`,
      `Composio keeps the sign-in and refreshes it. Claritia keeps only the connection's id and plain details like your account's address, never a password or token.`,
      `Every call Claritia makes to ${n} goes through Composio, which signs it for your connection.`,
    );
  } else if (way === "signin" || way === "signin_or_key") {
    out.push(`With Claritia's own ${n} sign-in, ${n} asks you to allow:`, ...scopeLines(kind));
    if (way === "signin_or_key" && b.key) out.push(`Or you paste ${b.key}. It's encrypted (AES-256) before it's saved, and only Claritia's servers can read it.`);
  } else if (way === "key") {
    if (b.key) out.push(`You paste ${b.key}.`);
    out.push("What you paste is encrypted (AES-256) before it's saved, and only Claritia's servers can read it.");
  } else if (way === "hook") {
    out.push(
      `No sign-in and no key: Claritia gives you a private webhook address to paste into ${n}. It carries a secret token, and anything sent without it is turned away.`,
      ...(entryOf(kind)?.hookSecret ? [`If you add ${n}'s signing secret, Claritia also checks ${n}'s signature on every delivery and turns away any that don't match.`] : []),
    );
  } else if (way === "omniscient") {
    out.push("You approve Claritia on Omniscient's own page (an Omniscient owner or admin). Omniscient hands Claritia an API key for your workspace, encrypted before it's saved.");
  } else if (way === "stripe") {
    out.push("You connect your own Stripe account to Claritia's platform through Stripe Connect (Standard), on Stripe's pages. Your account stays yours, with its own dashboard.");
  } else if (way === "app") {
    out.push(`You allow ${n} on Claritia's approve screen, as a workspace owner.`);
  }
  out.push(...b.uses, ...(b.never ?? []));
  return out;
}

/** What Disconnect does, from source_disconnect (036_sources.sql) and where the tool is used. */
function disconnect(kind: string, n: string): string {
  const e = entryOf(kind);
  const people = (e?.twoWay || e?.pushes) && e.objects.includes("contacts");
  const first = `Disconnect (owners only) deletes the saved sign-in${people ? ` and the links between Claritia's contacts and records in ${n}` : ""}; contacts and the history stay.`;
  const then = e?.twoWay || e?.pushes
    ? ` Forms that send to ${n} stop: each new fill fails with Connect ${n} again.${e.chat || e.analytics ? " Workflow steps that use it are skipped." : ""}`
    : e?.texts
      ? " Workflow texts stop going from your Twilio."
      : e?.ads
        ? " The form's Tracking stops sending to it."
        : e?.meetPay
          ? ` Meeting types and payment blocks set to ${n} need it connected again.`
          : "";
  return first + then;
}

function connectsOf(kind: string, way: Way): string {
  const n = nameOf(kind);
  const e = entryOf(kind);
  switch (way) {
    case "composio":
      return `One-click sign-in through Composio: Connect opens Composio's page for ${n}, then brings you back here. A card still signed in the old way shows Reconnect, which moves it to Composio. ${disconnect(kind, n)} Claritia doesn't end the sign-in on ${n}'s side; you can remove the access in ${n}'s own settings.`;
    case "signin":
      return `One-click sign-in with Claritia's own ${n} app: Connect opens ${n}'s sign-in, then brings you back here. ${disconnect(kind, n)} The access stays allowed in ${n} until you remove it there.`;
    case "signin_or_key":
      return `One-click sign-in with Claritia's own ${n} app, or a pasted key (Use a key instead). ${disconnect(kind, n)} A sign-in stays allowed in ${n} until you remove it there.`;
    case "key":
      return `${e?.warehouse ? "Database details you paste" : "A key you paste"}: Connect opens the form, and Claritia checks ${e?.warehouse ? "the details" : "the key"} with ${n} before it's saved. ${disconnect(kind, n)} The key itself still works in ${n} until you delete it there.`;
    case "hook":
      return `A webhook address you paste into ${n}: Connect ${e?.hookSecret ? "asks for the optional signing secret, then " : ""}shows the address, and Webhook URL shows it again later. Disconnect (owners only) turns the address off at once: anything ${n} sends to it after that is refused. Contacts already in stay.`;
    case "omniscient":
      return "One click: Connect opens Omniscient's approve page; Omniscient's own Connect Claritia button lands here too. Disconnect (owners only) deletes the saved key; contacts and the history stay.";
    case "stripe":
      return "Stripe Connect: Connect opens Stripe's pages to create or link your account, then brings you back here. Continue on Stripe finishes an account Stripe still needs details for. There's no Disconnect here.";
    case "app":
      return `${n} connects from its own side: Connect opens Claritia's page on ${n}, and signing in there makes a workspace API key named ${n}. Disconnect (owners only) revokes that key, which signs ${n} out and removes all its hooks.`;
  }
}

/** The tool's full detail on this server. Null for a kind the page doesn't show. */
export function detailsOf(kind: string, o: { composio: boolean }): ToolDetail | null {
  const b = BASES[kind];
  if (!b) return null;
  const way = wayOf(kind, o.composio);
  return { about: b.about, does: b.does, access: accessOf(kind, b, way), connects: connectsOf(kind, way), where: b.where };
}

/** The tools Settings › Integrations shows: those a form can send to, then the form and meeting tools whose webhooks
 * come in, then ads, texts, analytics, meeting places and payments. Zapier, Make and Stripe have cards of their own. */
export const PAGE_TOOLS: Entry[] = [
  ...new Map(
    [...CATALOG.filter((e) => e.twoWay || e.pushes), ...CATALOG.filter((e) => e.hook && (e.group === "form" || e.group === "event") && !(e.twoWay || e.pushes)), ...CATALOG.filter((e) => e.ads || e.texts || e.analytics || e.meetPay)].map((e) => [e.kind, e]),
  ).values(),
];

/** Every kind with details. */
export const DETAIL_KINDS = Object.keys(BASES);
/** Kinds whose Composio connection asks for a key (tests compare with composio.ts). */
export const COMPOSIO_ASKS = Object.fromEntries(Object.entries(BASES).flatMap(([k, b]) => (b.asks ? [[k, b.asks]] : []))) as Record<string, string>;
