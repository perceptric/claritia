import { formPage } from "@/lib/forms/formPage";

// A form on its own page (docs/form-builder.md Part 6): plain HTML with <claritia-form> and its script, so the page
// ships the form script alone (src/lib/forms/hosted.ts), with the link's preview from the live form. The same page by
// its link ending is /f/<workspace>/<ending> ([slug]/route.ts).

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return formPage(request, id);
}
