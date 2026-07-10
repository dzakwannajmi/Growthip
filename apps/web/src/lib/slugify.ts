/** Converts a heading string into a URL-safe id for anchor scrolling.
 * Used identically on both sides -- to generate the `id` on each
 * <section> and to compute which id a TocSidebar click should scroll
 * to -- so the two always agree without hand-maintaining a separate
 * id per heading. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
