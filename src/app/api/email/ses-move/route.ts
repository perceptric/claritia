// Whether Settings › Sending offers "Move to new sending" (docs/ses-plan.md, Step 4): EMAIL_SES_MOVE=1 and SES keys
// on the server. The worker makes new domains on SES under the same switch.
export function GET() {
  const on = process.env.EMAIL_SES_MOVE?.trim() === "1" && !!process.env.AWS_ACCESS_KEY_ID?.trim();
  return Response.json({ on }, { headers: { "Cache-Control": "no-store" } });
}
