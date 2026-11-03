import { scriptResponse } from "@/lib/forms/script";

// The <claritia-form> script at the address customers paste: cached 5 minutes (src/lib/forms/script.ts). The hosted
// form page and the embed load the versioned copy (/forms/v1.<hash>.js), cached for good.

export function GET() {
  return scriptResponse("v1.js");
}
