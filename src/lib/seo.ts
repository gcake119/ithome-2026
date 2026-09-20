export type SeoPageType = 'website' | 'article';

export interface SeoMetadataInput {
  title: string;
  description: string;
  canonicalUrl: string;
  siteName: string;
  authorName: string;
  socialImageUrl: string;
  pageType: SeoPageType;
  isHome?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
}

export function buildSeoMetadata(input: SeoMetadataInput) {
  const documentTitle = input.isHome ? input.title : `${input.title}｜${input.siteName}`;
  const shared = {
    title: input.title,
    description: input.description,
    url: input.canonicalUrl,
    image: input.socialImageUrl,
  };
  const jsonLd = input.pageType === 'article'
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: input.title,
        description: input.description,
        url: input.canonicalUrl,
        mainEntityOfPage: input.canonicalUrl,
        image: input.socialImageUrl,
        inLanguage: 'zh-Hant',
        author: { '@type': 'Person', name: input.authorName },
        ...(input.publishedTime ? { datePublished: input.publishedTime } : {}),
        ...(input.modifiedTime ? { dateModified: input.modifiedTime } : {}),
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: input.siteName,
        headline: input.title,
        description: input.description,
        url: input.canonicalUrl,
        image: input.socialImageUrl,
        inLanguage: 'zh-Hant',
        author: { '@type': 'Person', name: input.authorName },
      };

  return {
    documentTitle,
    openGraph: { ...shared, type: input.pageType, siteName: input.siteName, locale: 'zh_TW' },
    twitter: { ...shared, card: 'summary_large_image' as const },
    jsonLd,
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildSitemapXml(entries: Array<{ loc: string; lastmod?: string }>) {
  const urls = entries.map(({ loc, lastmod }) => [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []),
    '  </url>',
  ].join('\n')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
