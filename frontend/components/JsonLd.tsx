import { SITE_URL } from "@/lib/site";

/*
 * Structured data for search engines, as one JSON-LD script. `<` is escaped
 * so a name off the MLB API can never close the script tag early.
 */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** A page's trail back to the home page, as Google reads breadcrumbs. */
export const breadcrumbs = (trail: [name: string, path: string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map(([name, path], i) => ({
    "@type": "ListItem",
    position: i + 1,
    name,
    item: `${SITE_URL}${path}`,
  })),
});
