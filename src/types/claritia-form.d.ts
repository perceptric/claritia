// <claritia-form> in JSX (src/lib/forms/element.ts).
import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "claritia-form": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { "form-id"?: string; host?: string };
    }
  }
}
