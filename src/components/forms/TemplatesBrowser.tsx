"use client";

import { templateSlug } from "@/lib/forms/catalog";
import { Gallery } from "./Gallery";

/** The gallery on the website: each card opens the template's own page. */
export function TemplatesBrowser() {
  return <Gallery hrefFor={(t) => `/templates/${templateSlug(t)}`} />;
}
