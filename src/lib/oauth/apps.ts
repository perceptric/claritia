// The automation apps on the Forms API (docs/integrations-plan.md, Next step 1), for Settings › Integrations. Data
// only, so the browser can load it. `url` is the app's own page for Claritia, where Connect starts; a key made by
// signing in there carries the app's name.

export const AUTOMATION_APPS = [
  { id: "zapier", name: "Zapier", domain: "zapier.com", url: "https://zapier.com/apps/claritia/integrations" },
  { id: "make", name: "Make", domain: "make.com", url: "https://www.make.com/en/integrations/claritia" },
  { id: "activepieces", name: "Activepieces", domain: "activepieces.com", url: "https://www.activepieces.com/pieces/claritia" },
] as const;
