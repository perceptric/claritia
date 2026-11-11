// A logo drawing as a picture address. A picture made from an SVG must name the SVG namespace, or browsers show it
// broken; drawings kept before the cleaner added it (deep.ts) are fixed here. Browser and server.

/** The drawing with its namespace on the root. */
export function withSvgNs(svg: string): string {
  return /^\s*<svg\b[^>]*\sxmlns=/i.test(svg) ? svg : svg.replace(/^\s*<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** The drawing as a data address an <img> can show. */
export const svgDataUri = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(withSvgNs(svg))}`;
