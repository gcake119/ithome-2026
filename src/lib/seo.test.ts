import { describe, expect, test } from 'vitest';
import { buildSeoMetadata, buildSitemapXml } from './seo';

describe('SEO template', () => {
  test('builds reusable article metadata and BlogPosting structured data', () => {
    const metadata = buildSeoMetadata({
      title: 'Day 1｜做得出來，卻完全改不動',
      description: '從做出網站卻無法修改的經驗，回看 AI 協作開發需要補上的理解能力。',
      canonicalUrl: 'https://example.github.io/series/day/01/',
      siteName: '我的三十天學習誌',
      authorName: 'example-user',
      socialImageUrl: 'https://example.github.io/series/assets/social.png',
      pageType: 'article',
      publishedTime: '2026-09-01T00:00:00.000Z',
    });

    expect(metadata.documentTitle).toBe('Day 1｜做得出來，卻完全改不動｜我的三十天學習誌');
    expect(metadata.openGraph).toMatchObject({ type: 'article', siteName: '我的三十天學習誌' });
    expect(metadata.twitter.card).toBe('summary_large_image');
    expect(metadata.jsonLd).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'Day 1｜做得出來，卻完全改不動',
      datePublished: '2026-09-01T00:00:00.000Z',
      author: { '@type': 'Person', name: 'example-user' },
    });
  });

  test('keeps the homepage title unchanged and builds WebSite structured data', () => {
    const metadata = buildSeoMetadata({
      title: '完整系列標題', description: '系列摘要', canonicalUrl: 'https://example.com/',
      siteName: '短站名', authorName: '作者', socialImageUrl: 'https://example.com/social.png',
      pageType: 'website', isHome: true,
    });

    expect(metadata.documentTitle).toBe('完整系列標題');
    expect(metadata.jsonLd).toMatchObject({ '@type': 'WebSite', name: '短站名' });
  });

  test('builds an XML sitemap from canonical URLs', () => {
    const xml = buildSitemapXml([
      { loc: 'https://example.com/' },
      { loc: 'https://example.com/day/01/', lastmod: '2026-09-01' },
    ]);

    expect(xml).toContain('<loc>https://example.com/day/01/</loc>');
    expect(xml).toContain('<lastmod>2026-09-01</lastmod>');
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });
});
