import { brand } from "./brand";
import { publicUrl } from "./metadata";

export function webPageData(path: string, name: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": publicUrl(path),
        url: publicUrl(path),
        name,
        description,
        isPartOf: { "@id": publicUrl() + "#website" },
        breadcrumb: { "@id": publicUrl(path) + "#breadcrumbs" },
      },
      {
        "@type": "BreadcrumbList",
        "@id": publicUrl(path) + "#breadcrumbs",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: brand.name,
            item: publicUrl(),
          },
          { "@type": "ListItem", position: 2, name, item: publicUrl(path) },
        ],
      },
    ],
  };
}
