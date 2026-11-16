// What each tool on Settings › Integrations is, what it lets Claritia do there, and what people use it for: the tool's
// detail sheet (opened by clicking its card). Plain words for the person connecting it. Data only, no AI at runtime.

import { CATALOG, type Entry } from "./catalog.ts";

export type ToolDetail = {
  /** What the tool is, in a few plain sentences. */
  about: string;
  /** What connecting it lets Claritia do there. */
  permissions: string[];
  /** What people use it for with Claritia. */
  useCases: string[];
};

const DETAILS: Record<string, ToolDetail> = {
  hubspot: {
    about: "HubSpot is a CRM, a place where a business keeps track of every customer and lead. Teams use it to store contacts and companies, send marketing emails, and follow deals until they close. It has a free plan, so many small teams start there.",
    permissions: ["Create new contacts in HubSpot.", "Update contacts that are already in HubSpot, found by their email.", "See the people on your HubSpot team, so a new lead can get the right owner.", "See your HubSpot lists and add contacts to them.", "Add a few contact fields that Claritia fills in."],
    useCases: ["Every demo request from your website shows up in HubSpot as a new contact, with name, email, phone and job title.", "Someone who fills two forms stays one contact in HubSpot, updated with their latest answers.", "New leads go straight onto the HubSpot list you choose, so your follow-up emails start on their own.", "The salesperson Claritia picks for a lead becomes the contact owner in HubSpot."],
  },
  salesforce: {
    about: "Salesforce is the CRM that most large sales teams use. It holds leads, contacts, companies and deals, and companies build their whole sales process around it.",
    permissions: ["Create new contacts in Salesforce.", "Update contacts that are already in Salesforce, found by their email.", "See the people on your Salesforce team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a lead or contact in Salesforce, ready for your sales team.", "A person who already exists in Salesforce gets updated instead of duplicated.", "The rep Claritia routes a lead to becomes its owner in Salesforce.", "Your answers to custom questions go into the Salesforce fields you link them to."],
  },
  omniscient: {
    about: "Omniscient is a CRM with deal rooms, shared spaces where you and a buyer work through a deal together. It's made by the same team as Claritia.",
    permissions: ["Create new contacts in Omniscient.", "Update contacts that are already in Omniscient, found by their email.", "See the people on your Omniscient team, so a new lead can get the right owner."],
    useCases: ["New leads from your forms land in Omniscient as contacts.", "Booked meetings show up next to the contact, so the deal room has the full story.", "Returning visitors update their existing contact instead of making a new one."],
  },
  pipedrive: {
    about: "Pipedrive is a sales CRM built around a simple pipeline: deals move from left to right as they get closer to a sale. Small sales teams like it because it's easy to set up.",
    permissions: ["Create new contacts in Pipedrive.", "Update contacts that are already in Pipedrive, found by their email.", "See the people on your Pipedrive team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a person in Pipedrive.", "Someone who's already in Pipedrive gets updated, not duplicated.", "Answers to your questions go into the Pipedrive fields you link them to."],
  },
  attio: {
    about: "Attio is a modern CRM that you shape around your own data. It's popular with startups that want something more flexible than a classic CRM.",
    permissions: ["Create new contacts in Attio.", "Update contacts that are already in Attio, found by their email.", "See the people on your Attio team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a person record in Attio.", "A returning person updates their existing record.", "Custom questions fill the Attio attributes you link them to."],
  },
  close: {
    about: "Close is a sales CRM with calling, email and texting built in. It's made for teams that sell over the phone.",
    permissions: ["Create new contacts in Close.", "Update contacts that are already in Close, found by their email.", "See the people on your Close team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a lead in Close, ready for your reps to call.", "Someone who's already in Close gets updated with their newest answers.", "Your reps see a lead's form answers before the first call."],
  },
  zoho: {
    about: "Zoho CRM is a CRM from Zoho, a company with dozens of business apps. Teams use it to manage leads, contacts and deals in one place.",
    permissions: ["Create new contacts in Zoho CRM.", "Update contacts that are already in Zoho CRM, found by their email.", "See the people on your Zoho CRM team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a lead in Zoho CRM.", "A returning person gets updated, not duplicated.", "Custom questions go into the Zoho fields you link them to."],
  },
  dynamics: {
    about: "Microsoft Dynamics 365 is Microsoft's CRM for sales and customer service. It's common in larger companies that already run on Microsoft.",
    permissions: ["Create new contacts in Dynamics 365.", "Update contacts that are already in Dynamics 365, found by their email.", "See the people on your Dynamics 365 team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a contact in Dynamics 365.", "A returning person updates their existing contact.", "Your Microsoft-based sales team sees new leads without leaving Dynamics."],
  },
  gohighlevel: {
    about: "GoHighLevel is an all-in-one marketing and CRM platform made for agencies. Agencies use it to run funnels, texts, emails and pipelines for their clients.",
    permissions: ["Create new contacts in GoHighLevel.", "Update contacts that are already in GoHighLevel, found by their email.", "See the people on your GoHighLevel team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a contact in GoHighLevel.", "A returning person updates their existing contact.", "Your GoHighLevel automations can start the moment a lead arrives."],
  },
  freshsales: {
    about: "Freshsales is the CRM from Freshworks. It has phone, email and lead scoring built in, so sales teams can call and email leads without switching tools.",
    permissions: ["Create new contacts in Freshsales.", "Update contacts that are already in Freshsales, found by their email.", "See the people on your Freshsales team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a contact in Freshsales.", "A returning person gets updated, not duplicated.", "Your reps see new leads in Freshsales right away."],
  },
  copper: {
    about: "Copper is a CRM that lives inside Google Workspace. It's made for teams that work all day in Gmail.",
    permissions: ["Create new contacts in Copper.", "Update contacts that are already in Copper, found by their email.", "See the people on your Copper team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a person in Copper.", "A returning person updates their existing record.", "Leads appear next to your Gmail threads, ready to follow up."],
  },
  keap: {
    about: "Keap is a CRM and marketing tool for small businesses. It mixes contacts, emails and simple automations.",
    permissions: ["Create new contacts in Keap.", "Update contacts that are already in Keap, found by their email.", "See the people on your Keap team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a contact in Keap.", "A returning person updates their existing contact.", "Your Keap campaigns can pick up new leads as they arrive."],
  },
  monday: {
    about: "monday CRM is the sales CRM from monday.com. Teams track leads and deals on colorful boards.",
    permissions: ["Create new contacts in monday CRM.", "Update contacts that are already in monday CRM, found by their email.", "See the people on your monday CRM team, so a new lead can get the right owner."],
    useCases: ["Every form fill becomes a contact on your monday CRM board.", "A returning person updates their existing item.", "Your sales board fills itself as leads come in."],
  },
  mailchimp: {
    about: "Mailchimp is an email marketing tool for newsletters and campaigns. It's one of the most used email tools for small businesses.",
    permissions: ["See your Mailchimp lists.", "Add new subscribers to the list you choose.", "Update subscribers who are already on that list."],
    useCases: ["People who sign up through your form join your Mailchimp audience.", "Webinar sign-ups go onto their own list, so you can send reminders from Mailchimp.", "Someone already on your list gets their details updated, not added twice."],
  },
  klaviyo: {
    about: "Klaviyo is an email and text marketing tool built for online stores. Shops use it to send product emails based on what customers do.",
    permissions: ["See your Klaviyo lists.", "Add new subscribers to the list you choose.", "Update subscribers who are already on that list."],
    useCases: ["Form sign-ups join the Klaviyo list you pick, so your welcome emails start.", "Quiz answers go with the subscriber, so you can send the right product emails.", "A returning subscriber gets updated, not added twice."],
  },
  activecampaign: {
    about: "ActiveCampaign is an email marketing and automation tool. Teams use it to send email sequences that react to what people do.",
    permissions: ["See your ActiveCampaign lists.", "Add new subscribers to the list you choose.", "Update subscribers who are already on that list."],
    useCases: ["Form sign-ups join your ActiveCampaign list and start your automations.", "A returning contact gets updated with their newest answers.", "Leads from different forms can go onto different lists."],
  },
  brevo: {
    about: "Brevo is an email, text and chat marketing tool. It used to be called Sendinblue. Small businesses use it for newsletters, promotions and automatic welcome emails.",
    permissions: ["See your Brevo lists.", "Add new subscribers to the list you choose.", "Update subscribers who are already on that list."],
    useCases: ["Form sign-ups join the Brevo list you choose.", "A returning contact gets updated, not duplicated.", "Your Brevo campaigns reach new leads right away."],
  },
  kit: {
    about: "Kit is an email marketing tool for creators and newsletter writers. It used to be called ConvertKit.",
    permissions: ["See your Kit lists.", "Add new subscribers to the list you choose.", "Update subscribers who are already on that list."],
    useCases: ["Form sign-ups become subscribers in Kit.", "Readers who sign up from different forms can be told apart.", "A returning subscriber is updated, not added twice."],
  },
  mailerlite: {
    about: "MailerLite is a simple email marketing tool. Small businesses and creators use it to send newsletters, build sign-up lists and set up automatic emails.",
    permissions: ["See your MailerLite lists.", "Add new subscribers to the list you choose.", "Update subscribers who are already on that list."],
    useCases: ["Form sign-ups join your MailerLite group.", "A returning subscriber is updated, not added twice.", "New subscribers start your MailerLite welcome emails."],
  },
  google_sheets: {
    about: "Google Sheets is Google's spreadsheet app. It's free, works in the browser, and many teams use it as a simple shared database.",
    permissions: ["See the spreadsheet you pick in Claritia.", "Add a new row for every form fill.", "Add a column when you add a new question to your form."],
    useCases: ["Every form fill becomes a new row, so your whole team can see answers in one sheet.", "Share the sheet with people who don't use Claritia.", "Use Sheets formulas and charts on your form answers.", "Fills that are sent twice still make only one row."],
  },
  excel: {
    about: "Excel Online is Microsoft's spreadsheet app in the browser. It saves to OneDrive or SharePoint.",
    permissions: ["See the workbook you pick in Claritia.", "Add a new row for every form fill.", "Add a column when you add a new question to your form."],
    useCases: ["Every form fill becomes a new row in your Excel sheet.", "Teams on Microsoft 365 see answers without a new tool.", "Build reports and charts in Excel from your form answers."],
  },
  airtable: {
    about: "Airtable is a spreadsheet and a database in one. Teams use it to build simple apps, trackers and content calendars.",
    permissions: ["See the bases and tables you pick.", "Add a new record for every form fill.", "Add a field when you add a new question."],
    useCases: ["Every form fill becomes a record in your Airtable table.", "Turn form answers into a tracker, like job applications or event sign-ups.", "Use Airtable views and automations on new records."],
  },
  notion: {
    about: "Notion is a workspace for notes, docs, wikis and databases. Teams use it to plan work and keep knowledge in one place.",
    permissions: ["See only the Notion pages and databases you share with Claritia.", "Add a new item to that database for every form fill.", "Add a property when you add a new question."],
    useCases: ["Every form fill becomes a new item in a Notion database.", "Collect feedback, applications or requests where your team already works.", "Link form answers to your other Notion pages."],
  },
  postgres: {
    about: "PostgreSQL is a popular open-source database. Developers use it to store the data behind their apps and websites, and many companies run their reports from it.",
    permissions: ["Connect to your PostgreSQL database with the details you enter.", "Read the columns of the table you choose.", "Add a new row to that table for every form fill."],
    useCases: ["Every form fill lands as a row in your own database.", "Your app or reports can use form answers right away.", "Keep a full copy of your leads in a database you control."],
  },
  mysql: {
    about: "MySQL is a popular open-source database. Many websites and apps, including most WordPress sites, store their data in it.",
    permissions: ["Connect to your MySQL database with the details you enter.", "Read the columns of the table you choose.", "Add a new row to that table for every form fill."],
    useCases: ["Every form fill lands as a row in your own database.", "Your app or reports can use form answers right away.", "Keep a full copy of your leads in a database you control."],
  },
  linear: {
    about: "Linear is an issue tracker for software teams. Teams use it to plan and track bugs and features.",
    permissions: ["See your Linear teams.", "Create a new issue for every form fill.", "Find issues it made before, so it never makes the same one twice."],
    useCases: ["Bug reports from your form become Linear issues with every answer inside.", "Feature requests land in the right team's backlog.", "Your engineers never copy and paste from a form again."],
  },
  trello: {
    about: "Trello organizes work on boards. Each task is a card that moves between lists, like To do, Doing and Done. Teams like it because it's visual and simple.",
    permissions: ["See your Trello boards and lists.", "Create a new card for every form fill.", "Find cards it made before, so it never makes the same one twice."],
    useCases: ["Every request from your form becomes a card on your Trello board.", "New job applications land in a To review list.", "Your team works through form answers card by card."],
  },
  clickup: {
    about: "ClickUp is an all-in-one work app for tasks, docs, goals and projects. Teams use it to plan work, assign tasks and track progress in one place.",
    permissions: ["See your ClickUp spaces and lists.", "Create a new task for every form fill.", "Find tasks it made before, so it never makes the same one twice."],
    useCases: ["Every form fill becomes a ClickUp task in the list you pick.", "Client requests turn into tasks your team can assign and track.", "Answers show up inside the task, so nothing gets lost."],
  },
  monday_work: {
    about: "monday.com is a work platform where teams plan projects on colorful boards. Each row is an item, like a task or a request, that moves through stages.",
    permissions: ["See your monday.com boards.", "Create a new item for every form fill.", "Find items it made before, so it never makes the same one twice."],
    useCases: ["Every form fill becomes an item on your monday.com board.", "Project requests land in the right board with all the details.", "Your team tracks each request through to done."],
  },
  smartsuite: {
    about: "SmartSuite is a work platform for projects, processes and data. Teams build their own trackers, like a hiring pipeline or a client list, without code.",
    permissions: ["See your SmartSuite solutions and tables.", "Create a new record for every form fill.", "Find records it made before, so it never makes the same one twice."],
    useCases: ["Every form fill becomes a record in SmartSuite.", "Requests and applications get tracked from start to finish.", "Your SmartSuite automations can run on new records."],
  },
  zendesk: {
    about: "Zendesk is a help desk. Support teams use it to answer customer questions, where every question becomes a ticket that someone owns until it's solved.",
    permissions: ["See your Zendesk account.", "Create a new ticket for every form fill.", "Find tickets it made before, so it never makes the same one twice."],
    useCases: ["Support forms become Zendesk tickets with every answer inside.", "Customers get help without emailing you.", "Your agents see the full request in one place."],
  },
  freshdesk: {
    about: "Freshdesk is the help desk from Freshworks. Support teams answer customer questions as tickets.",
    permissions: ["See your Freshdesk help desk.", "Create a new ticket for every form fill.", "Find tickets it made before, so it never makes the same one twice."],
    useCases: ["Support forms become Freshdesk tickets.", "Every answer from the form is inside the ticket.", "Your support team works from one inbox."],
  },
  intercom: {
    about: "Intercom is a customer messaging tool. Teams use it to chat with customers for sales and support.",
    permissions: ["See your Intercom workspace.", "Create a new conversation for every form fill.", "Find conversations it made before, so it never makes the same one twice."],
    useCases: ["Form fills start a conversation in Intercom, so your team can reply.", "Support requests reach the people who answer chats.", "Every answer from the form is inside the conversation."],
  },
  google_docs: {
    about: "Google Docs is Google's word processor. Teams write, edit and share documents in the browser, and several people can work on the same document at once.",
    permissions: ["Read the template document you link.", "Create a new document from that template for every form fill."],
    useCases: ["Every form fill creates a filled-in document, like a proposal or an intake summary.", "Answers drop into the right spots in your template, keeping your styling.", "Each person gets their own document, ready to share."],
  },
  docusign: {
    about: "DocuSign is the most used tool for signing documents online. Businesses use it to send contracts, agreements and forms that people sign from any device.",
    permissions: ["See your DocuSign templates.", "Send a document from a template to the person who filled your form.", "Fill the document with their answers before it's sent."],
    useCases: ["After someone fills your form, they get a contract to sign right away.", "Their name and answers are already filled in.", "No more sending the same agreement by hand."],
  },
  pandadoc: {
    about: "PandaDoc creates proposals, quotes and contracts that people can sign online. Sales teams use its templates to send good-looking documents in minutes.",
    permissions: ["See your PandaDoc templates.", "Create and send a document from a template.", "Fill it with the person's answers."],
    useCases: ["A filled form turns into a proposal or quote, sent to sign.", "Prices and details come from the person's answers.", "Your sales team stops building documents by hand."],
  },
  google_drive: {
    about: "Google Drive is Google's cloud storage for files and folders. Teams keep their documents there and share them with each other and with clients.",
    permissions: ["Create folders inside the folder you pick.", "Upload the files people send through your forms.", "Only work inside that folder."],
    useCases: ["Files people upload in your forms are saved to Google Drive automatically.", "Each fill gets its own folder, named so you can find it.", "Resumes, photos and documents end up where your team already looks."],
  },
  onedrive: {
    about: "OneDrive is Microsoft's cloud storage for files and folders. It comes with Microsoft 365, so teams that use Word and Excel often keep their files there.",
    permissions: ["Create folders inside the folder you pick.", "Upload the files people send through your forms.", "Only work inside that folder."],
    useCases: ["Files people upload in your forms are saved to OneDrive automatically.", "Each fill gets its own folder, named so you can find it.", "Resumes, photos and documents end up where your team already looks."],
  },
  dropbox: {
    about: "Dropbox is cloud storage for keeping and sharing files. People use it to back up files, send large files and work on shared folders with a team.",
    permissions: ["Create folders inside the folder you pick.", "Upload the files people send through your forms.", "Only work inside that folder."],
    useCases: ["Files people upload in your forms are saved to Dropbox automatically.", "Each fill gets its own folder, named so you can find it.", "Resumes, photos and documents end up where your team already looks."],
  },
  box: {
    about: "Box is cloud storage and file sharing made for businesses. Larger companies use it because of its security controls and its record of who opened what.",
    permissions: ["Create folders inside the folder you pick.", "Upload the files people send through your forms.", "Only work inside that folder."],
    useCases: ["Files people upload in your forms are saved to Box automatically.", "Each fill gets its own folder, named so you can find it.", "Resumes, photos and documents end up where your team already looks."],
  },
  s3: {
    about: "Amazon S3 is Amazon's storage for files of any size. Developers use it to keep files for apps and websites.",
    permissions: ["Write files into the bucket you choose, with the key you enter."],
    useCases: ["Files people upload in your forms are copied to your own S3 bucket.", "Keep every upload in storage you control.", "Your other systems can pick up the files from S3."],
  },
  teams: {
    about: "Microsoft Teams is Microsoft's chat and meeting app for work. Teams talk in channels, share files and hold video calls, all inside Microsoft 365.",
    permissions: ["See your teams and channels.", "Post messages in the channel you pick."],
    useCases: ["Get a message in Teams every time someone fills a form.", "Your sales channel hears about hot leads right away.", "Workflows can post updates, like a meeting being booked."],
  },
  discord: {
    about: "Discord is a chat app for communities and teams. Groups talk in channels by text, voice and video, and many online communities live there.",
    permissions: ["Post messages in the channel you link."],
    useCases: ["Get a Discord message every time someone fills a form.", "Your community team sees new sign-ups as they happen.", "Workflows can post updates to your server."],
  },
  twilio: {
    about: "Twilio lets businesses send text messages and make phone calls through software. Companies use it for reminders, alerts and two-way texting with customers.",
    permissions: ["Send text messages from your Twilio number.", "Get replies, like STOP, so people who opt out stop getting texts.", "See whether each text was delivered."],
    useCases: ["Send a text reminder before every meeting.", "Text new leads right after they fill your form.", "People who reply STOP are never texted again."],
  },
  typeform: {
    about: "Typeform is a form builder known for showing one question at a time. People use it for surveys, quizzes and lead forms that feel like a conversation.",
    permissions: ["Claritia only receives the answers Typeform sends to it.", "Claritia can't see or change anything else in your Typeform account."],
    useCases: ["Keep using Typeform forms and still get every answer into Claritia.", "Send Typeform leads to your CRM, email lists and workflows through Claritia.", "Book meetings for people who fill your Typeform forms."],
  },
  tally: {
    about: "Tally is a simple, free form builder. You make a form the way you write a document, and it's popular with startups and creators.",
    permissions: ["Claritia only receives the answers Tally sends to it.", "Claritia can't see or change anything else in your Tally account."],
    useCases: ["Keep using Tally forms and still get every answer into Claritia.", "Send Tally leads to your CRM, email lists and workflows through Claritia.", "Book meetings for people who fill your Tally forms."],
  },
  webflow: {
    about: "Webflow is a website builder for designers. It lets teams design and launch websites without code, and every site can have its own forms.",
    permissions: ["Claritia only receives the answers Webflow sends to it.", "Claritia can't see or change anything else in your Webflow account."],
    useCases: ["Keep using Webflow forms and still get every answer into Claritia.", "Send Webflow leads to your CRM, email lists and workflows through Claritia.", "Book meetings for people who fill your Webflow forms."],
  },
  calendly: {
    about: "Calendly is a scheduling tool. People pick a time from your calendar and the meeting is booked.",
    permissions: ["Claritia only receives the bookings Calendly sends to it.", "Claritia can't see or change anything else in your Calendly account."],
    useCases: ["See Calendly bookings next to the form fill that came before them.", "Start a Claritia workflow when someone books, like a reminder or a follow-up.", "Move to Claritia's own booking pages at your own pace."],
  },
  calcom: {
    about: "Cal.com is an open-source scheduling tool. People pick a free time from your calendar and the meeting is booked, like Calendly, but you can host it yourself.",
    permissions: ["Claritia only receives the bookings Cal.com sends to it.", "Claritia can't see or change anything else in your Cal.com account."],
    useCases: ["See Cal.com bookings next to the form fill that came before them.", "Start a Claritia workflow when someone books, like a reminder or a follow-up.", "Move to Claritia's own booking pages at your own pace."],
  },
  webex: {
    about: "Webex is Cisco's video meeting app. Many large companies use it for calls, webinars and team meetings.",
    permissions: ["Create Webex meetings for the calls people book with you."],
    useCases: ["Every meeting booked through Claritia gets its own Webex link.", "Guests get the link in their confirmation email.", "Your team keeps using Webex for calls."],
  },
  whereby: {
    about: "Whereby is a video meeting app that runs in the browser, with nothing to install. Guests click a link and they're in the call.",
    permissions: ["Create Whereby rooms for the calls people book with you."],
    useCases: ["Every booked meeting gets its own Whereby link.", "Guests join from their browser.", "The link is in the confirmation email."],
  },
  stripe: {
    about: "Stripe is the payments platform millions of businesses use to take card payments online. Money from each payment goes into your Stripe account and then to your bank.",
    permissions: ["Take payments for your paid meetings, paid straight into your Stripe account.", "Show you whether your account is ready to take payments."],
    useCases: ["Charge for consultations, coaching or paid demos when people book.", "Money goes straight to your Stripe account.", "Guests pay by card before the meeting is confirmed."],
  },
  paypal: {
    about: "PayPal is an online payments service used around the world. Many people already have an account, so they can pay without typing a card number.",
    permissions: ["Take payments for your paid meetings, paid into your PayPal account."],
    useCases: ["Let guests pay with PayPal when they book a paid meeting.", "Reach people who'd rather not type a card number.", "Money goes straight to your PayPal account."],
  },
  square: {
    about: "Square takes payments online and in person. Many shops, cafes and service businesses already use it for their card readers and online sales.",
    permissions: ["Take payments for your paid meetings, paid into your Square account."],
    useCases: ["Charge for bookings with the same account you use in your shop.", "Money goes straight to your Square account.", "Guests pay by card before the meeting is confirmed."],
  },
  segment: {
    about: "Segment collects data about what your customers do and sends it to your other tools. Teams use it so every tool sees the same customer data.",
    permissions: ["Send events to Segment, like a form fill or a booked meeting."],
    useCases: ["See form fills and bookings in Segment next to everything else people do.", "Measure which pages and campaigns bring in leads.", "Workflows can send their own events, like a lead becoming qualified."],
  },
  posthog: {
    about: "PostHog is a product analytics tool. Teams use it to see what people do in their app, watch session replays and turn features on and off.",
    permissions: ["Send events to PostHog, like a form fill or a booked meeting."],
    useCases: ["See form fills and bookings in PostHog next to everything else people do.", "Measure which pages and campaigns bring in leads.", "Workflows can send their own events, like a lead becoming qualified."],
  },
  mixpanel: {
    about: "Mixpanel is a product analytics tool. It shows what people do in your app or website, like which features they use and where they drop off.",
    permissions: ["Send events to Mixpanel, like a form fill or a booked meeting."],
    useCases: ["See form fills and bookings in Mixpanel next to everything else people do.", "Measure which pages and campaigns bring in leads.", "Workflows can send their own events, like a lead becoming qualified."],
  },
  amplitude: {
    about: "Amplitude is a product analytics tool. Teams use it to understand how people use their product and which changes help them stick around.",
    permissions: ["Send events to Amplitude, like a form fill or a booked meeting."],
    useCases: ["See form fills and bookings in Amplitude next to everything else people do.", "Measure which pages and campaigns bring in leads.", "Workflows can send their own events, like a lead becoming qualified."],
  },
  meta_ads: {
    about: "Meta Ads runs ads on Facebook and Instagram. Businesses pay to show ads to people based on their interests, location and more.",
    permissions: ["Send conversions to Meta, like a form fill or a booked meeting."],
    useCases: ["Tell Meta which ads brought in real leads, so it shows your ads to more people like them.", "Count bookings as conversions, not just clicks.", "Spend less to get each lead."],
  },
  google_ads: {
    about: "Google Ads runs ads on Google Search, YouTube and across millions of websites. You pay when people click, and Google tries to show ads to people likely to buy.",
    permissions: ["Send conversions to Google Ads, like a form fill or a booked meeting."],
    useCases: ["Tell Google which ads brought in real leads, so it bids smarter.", "Count bookings as conversions, not just clicks.", "See your true cost for each lead."],
  },
  zapier: {
    about: "Zapier connects thousands of apps with automations called Zaps. Each Zap watches for something in one app and then does something in another, with no code.",
    permissions: ["Start your Zaps when a form is filled or a meeting is booked."],
    useCases: ["Send form fills to any of Zapier's thousands of apps.", "Build your own automations without code.", "Connect tools Claritia doesn't have yet."],
  },
  make: {
    about: "Make builds visual automations, called scenarios, that connect your apps. You drag steps onto a canvas to move data between tools, with no code.",
    permissions: ["Start your scenarios when a form is filled or a meeting is booked."],
    useCases: ["Send form fills and bookings to any app Make supports.", "Build step-by-step automations on a visual canvas.", "Connect tools Claritia doesn't have yet."],
  },
};

export function detailsOf(kind: string): ToolDetail | null {
  return DETAILS[kind] ?? null;
}

/** The tools Settings › Integrations shows: those a form can send to, then the form and meeting tools whose webhooks
 * come in, then ads, texts, analytics, meeting places and payments. Zapier, Make and Stripe have cards of their own. */
export const PAGE_TOOLS: Entry[] = [
  ...new Map(
    [...CATALOG.filter((e) => e.twoWay || e.pushes), ...CATALOG.filter((e) => e.hook && (e.group === "form" || e.group === "event") && !(e.twoWay || e.pushes)), ...CATALOG.filter((e) => e.ads || e.texts || e.analytics || e.meetPay)].map((e) => [e.kind, e]),
  ).values(),
];

/** Every kind with details. */
export const DETAIL_KINDS = Object.keys(DETAILS);
