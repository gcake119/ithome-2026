import { chromium } from 'playwright-core';

const ITHOME_ORIGIN = 'https://ithelp.ithome.com.tw';
const BLOCK_PATTERNS = [
  ['cloudflare', /cloudflare|attention required/i],
  ['captcha', /captcha|驗證您是人類|人機驗證/i],
  ['rate_limited', /too many requests|\b429\b|請求過於頻繁/i],
];

function reasonError(reasonCode, message = reasonCode) {
  return Object.assign(new Error(message), { reasonCode });
}

function requireIthomeUrl(value, field) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${field} must be a valid URL`); }
  if (url.origin !== ITHOME_ORIGIN) throw new Error(`${field} must use ${ITHOME_ORIGIN}`);
  return url.toString();
}

function requireLoopbackEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('CDP endpoint must be a valid loopback URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('CDP endpoint must use an HTTP loopback address');
  }
  return url.toString().replace(/\/$/, '');
}

async function bodyText(page) {
  return page.evaluate(() => document.body?.innerText || '');
}

function blockedBy(text) {
  return BLOCK_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

async function navigate(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (response?.status?.() === 429) throw reasonError('rate_limited');
  const text = await bodyText(page);
  const antiAutomation = blockedBy(text);
  if (antiAutomation) throw reasonError(antiAutomation);
  return text;
}

async function exactVisibleCount(locator) {
  const count = await locator.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) visible += 1;
  }
  return visible;
}

export function matchDraftEntries(entries, title) {
  return entries.flatMap((entry) => {
    const href = String(entry?.href || '').trim();
    let url;
    try { url = new URL(href, ITHOME_ORIGIN); } catch { return []; }
    if (url.origin !== ITHOME_ORIGIN || !/^\/articles\/[^/]+\/draft\/?$/.test(url.pathname)) return [];
    const entryTitle = String(entry?.title || '').trim();
    const text = String(entry?.text || '');
    if (entryTitle !== title && !text.split(/\r?\n/).some((line) => line.trim() === title)) return [];
    return [{ id: url.pathname, url: url.toString(), title: entryTitle || title, status: /草稿/.test(text) ? 'draft' : 'unknown', text }];
  });
}

export function createPlaywrightIthomeDriver({ chromiumImpl = chromium, config }) {
  const cdpEndpoint = requireLoopbackEndpoint(config?.cdpEndpoint);
  const draftsUrl = requireIthomeUrl(config?.draftsUrl, 'draftsUrl');
  const publicArticlesUrl = requireIthomeUrl(config?.publicArticlesUrl || config?.draftsUrl, 'publicArticlesUrl');
  const { expectedAccount, expectedSeriesTitle, expectedContestTag } = config || {};
  if (![expectedAccount, expectedSeriesTitle, expectedContestTag].every((value) => typeof value === 'string' && value)) {
    throw new Error('expected account, series title, and contest tag are required');
  }

  let browser;
  let page;

  function requirePage() {
    if (!page) throw reasonError('browser_not_connected');
    return page;
  }

  return {
    async connect() {
      browser = await chromiumImpl.connectOverCDP(cdpEndpoint);
      const contexts = browser.contexts();
      if (contexts.length !== 1) throw reasonError('browser_context_ambiguous');
      const context = contexts[0];
      const pages = context.pages();
      page = pages.find((candidate) => {
        try { return new URL(candidate.url()).origin === ITHOME_ORIGIN; } catch { return false; }
      }) || pages[0] || await context.newPage();
    },

    async close() {
      // The Chrome process is user-owned. Let process exit disconnect CDP; never close the browser or its profile here.
      browser = undefined;
      page = undefined;
    },

    async inspectSession() {
      const activePage = requirePage();
      let text;
      try { text = await navigate(activePage, draftsUrl); }
      catch (error) {
        if (BLOCK_PATTERNS.some(([reason]) => reason === error?.reasonCode)) {
          return { authenticated: false, antiAutomation: error.reasonCode };
        }
        throw error;
      }

      const antiAutomation = blockedBy(text);
      if (antiAutomation) return { authenticated: false, antiAutomation };
      const accountVisible = (await activePage.getByText(expectedAccount, { exact: true }).count()) > 0;
      const loggedOut = /登入|sign in/i.test(text) && !accountVisible;
      return {
        authenticated: accountVisible && !loggedOut,
        antiAutomation: null,
        account: accountVisible ? expectedAccount : null,
        seriesTitle: (await activePage.getByText(expectedSeriesTitle, { exact: true }).count()) > 0 ? expectedSeriesTitle : null,
        contestTag: (await activePage.getByText(expectedContestTag, { exact: true }).count()) > 0 ? expectedContestTag : null,
      };
    },

    async scanDrafts({ payload }) {
      const activePage = requirePage();
      const root = new URL(draftsUrl);
      const seen = new Set();
      const entries = [];
      let pageUrl = root.toString();

      while (pageUrl && !seen.has(pageUrl) && seen.size < 100) {
        seen.add(pageUrl);
        await navigate(activePage, pageUrl);
        const snapshot = await activePage.evaluate(() => {
          const links = [...document.querySelectorAll('a[href*="/articles/"]')];
          const pageEntries = links.map((link) => {
            const container = link.closest('article, li, .list-group-item, .card, tr') || link.parentElement;
            const text = container?.innerText || link.innerText || '';
            return { href: link.getAttribute('href'), title: link.innerText.trim(), text };
          });
          const next = document.querySelector('a[rel="next"]')
            || [...document.querySelectorAll('a')].find((link) => /^(下一頁|next)$/i.test(link.textContent.trim()));
          return { entries: pageEntries, nextHref: next?.getAttribute('href') || null };
        });
        entries.push(...snapshot.entries);
        if (!snapshot.nextHref) break;
        const next = new URL(snapshot.nextHref, root);
        if (next.origin !== root.origin || next.pathname !== root.pathname) throw reasonError('draft_pagination_invalid');
        pageUrl = next.toString();
      }

      return matchDraftEntries(entries, payload.title);
    },

    async scanPublic({ payload, bootstrap }) {
      const activePage = requirePage();
      const targetUrl = bootstrap?.seriesUrl ? requireIthomeUrl(bootstrap.seriesUrl, 'seriesUrl') : publicArticlesUrl;
      await navigate(activePage, targetUrl);
      return activePage.evaluate(({ title, origin }) => [...document.querySelectorAll('a[href*="/articles/"]')]
        .filter((link) => !/\/draft\/?$/.test(link.getAttribute('href') || ''))
        .filter((link) => link.textContent.trim() === title)
        .map((link) => ({ title, url: new URL(link.getAttribute('href'), origin).toString() })), { title: payload.title, origin: ITHOME_ORIGIN });
    },

    async inspectDraft({ draft }) {
      const activePage = requirePage();
      await navigate(activePage, requireIthomeUrl(draft.url, 'draftUrl'));
      const titleField = activePage.locator('input[placeholder*="好標題"]:visible');
      const bodyEditor = activePage.locator('.CodeMirror-code:visible');
      if (await titleField.count() !== 1 || await bodyEditor.count() !== 1) throw reasonError('editor_unreadable');
      const title = await titleField.inputValue();
      const body = await bodyEditor.innerText();
      const text = await bodyText(activePage);
      return {
        title,
        firstBodyLine: body.split(/\r?\n/, 1)[0],
        status: /儲存草稿|草稿/.test(text) ? 'draft' : 'unknown',
        seriesTitle: text.includes(expectedSeriesTitle) ? expectedSeriesTitle : null,
        contestTag: text.includes(expectedContestTag) ? expectedContestTag : null,
      };
    },

    async publishOnce({ payload }) {
      const activePage = requirePage();
      const titleField = activePage.locator('input[placeholder*="好標題"]:visible');
      const bodyEditor = activePage.locator('.CodeMirror-code:visible');
      if (await titleField.inputValue() !== payload.title || (await bodyEditor.innerText()).split(/\r?\n/, 1)[0] !== payload.syncLine) {
        throw reasonError('draft_changed_before_publish');
      }

      let publishAction = activePage.getByText('發表文章', { exact: true });
      if (await exactVisibleCount(publishAction) === 0) {
        const menuButtons = activePage.locator('button[aria-haspopup="menu"]:visible, button.dropdown-toggle:visible');
        if (await menuButtons.count() !== 1) throw reasonError('publish_control_ambiguous');
        await menuButtons.click();
        publishAction = activePage.getByText('發表文章', { exact: true });
      }

      if (await exactVisibleCount(publishAction) !== 1) throw reasonError('publish_control_ambiguous');
      const deleteAction = activePage.getByText('刪除草稿', { exact: true });
      if (await exactVisibleCount(deleteAction) !== 1) throw reasonError('publish_menu_unverified');
      await publishAction.click({ timeout: 10_000, noWaitAfter: true });
      return { clicked: true };
    },

    async verifyPublic({ payload, bootstrap }) {
      const activePage = requirePage();
      try { await activePage.waitForLoadState('domcontentloaded', { timeout: 15_000 }); } catch {}
      const current = activePage.url();
      if (!/^https:\/\/ithelp\.ithome\.com\.tw\/articles\/[^/]+\/?$/.test(current)) {
        const entries = await this.scanPublic({ payload, bootstrap });
        if (entries.length !== 1) return { verified: false };
        await navigate(activePage, entries[0].url);
      }
      const text = await bodyText(activePage);
      if (blockedBy(text)) return { verified: false };
      const titleCount = await activePage.getByText(payload.title, { exact: true }).count();
      const canonicalCount = await activePage.locator(`a[href="${payload.canonicalUrl}"]`).count();
      return { verified: titleCount > 0 && canonicalCount > 0, articleUrl: activePage.url() };
    },
  };
}
