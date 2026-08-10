// Pulls real product name/photo/price from a store's own product page —
// using the same structured data (schema.org JSON-LD, then Open Graph tags)
// the store publishes for search engines. This is reliable across most
// e-commerce sites and never invents data; if the page has no markup, it
// returns null and the user fills the fields in by hand.
export interface ProductInfo {
  name: string | null;
  imageUrl: string | null;
  price: number | null;
  sourceUrl: string;
}

function extractJsonLdProduct(html: string): { name?: string; image?: string; price?: number } | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed["@graph"] ?? [])];
      for (const node of candidates) {
        if (node?.["@type"] === "Product" || (Array.isArray(node?.["@type"]) && node["@type"].includes("Product"))) {
          const image = Array.isArray(node.image) ? node.image[0] : node.image;
          const price = node.offers?.price ?? node.offers?.[0]?.price;
          return { name: node.name, image, price: price ? Number(price) : undefined };
        }
      }
    } catch {
      // not valid JSON, try the next block
    }
  }
  return null;
}

function extractMetaTag(html: string, property: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, "i"));
  return match ? match[1] : null;
}

export async function fetchProductInfo(url: string): Promise<ProductInfo | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SegundoCerebro/1.0)" } });
    if (!res.ok) return null;
    const html = await res.text();

    const jsonLd = extractJsonLdProduct(html);
    const name = jsonLd?.name ?? extractMetaTag(html, "og:title");
    const imageUrl = jsonLd?.image ?? extractMetaTag(html, "og:image");
    const price = jsonLd?.price ?? null;

    if (!name && !imageUrl) return null;
    return { name: name ?? null, imageUrl: imageUrl ?? null, price, sourceUrl: url };
  } catch {
    return null;
  }
}
