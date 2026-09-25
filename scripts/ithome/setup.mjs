#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { CONFIG_PATH, PUBLIC_DIR, publicAssetStatus, saveProjectConfig, validateProjectConfig } from './config.mjs';

const REQUIRED = ['account', 'series-title', 'contest-tag', 'contest', 'day1-date', 'github-owner', 'github-repo'];
const OPTIONAL = [
  'site-tagline', 'home-kicker', 'home-lead', 'home-summary',
  'seo-site-name', 'seo-author-name', 'seo-social-image',
  'brand-light', 'brand-dark', 'brand-alt', 'favicon', 'apple-touch-icon',
];
const ACTIONS = new Set(['preview', 'write', 'check']);
export const DEFAULT_TEMPLATE = {
  site: { tagline: '一份陪你完成三十天挑戰的學習誌', home: { kicker: '從第一天開始，建立自己的學習路線', lead: '每天完成一個主題，也保留回頭整理與延伸探索的空間。', summary: '這裡收錄完整的三十天鐵人賽文章，並在賽後持續補充心得與實作筆記。' } },
  learningMap: { title: '三十天學習地圖', description: '依照自己的速度，從基礎一路走到回顧與整合。', sectionHeading: '先看懂這趟路怎麼走', sectionLabel: '階段', sections: [
    { id: 'foundation', title: '建立基礎', description: '先理解題目、工具與合作方式。', articleContext: '先建立閱讀後續內容需要的共同基礎。' },
    { id: 'practice', title: '開始實作', description: '把觀念帶進可驗證的小型任務。', articleContext: '把觀念帶進可以觀察與驗證的實作。' },
    { id: 'reflection', title: '整理與延伸', description: '回顧做法，建立可以繼續使用的方法。', articleContext: '整理實作經驗，留下可以繼續使用的方法。' },
  ] },
  extensions: { enabled: false, mode: 'local', title: '延伸閱讀', description: '鐵人賽以外的心得、補充與後續實作。', externalSeries: { title: '後續系列', description: '在其他網站繼續閱讀這個系列的後續內容。', url: 'https://example.com/' } },
  brand: { mark: { light: 'assets/ai-collaboration-mark.png', dark: 'assets/ai-collaboration-mark-dark.png', alt: 'iThome 鐵人賽系列標誌' }, favicon: 'favicon.png', appleTouchIcon: 'apple-touch-icon.png' },
  seo: { siteName: '三十天學習誌', authorName: '公開作者名稱', socialImage: 'assets/ai-collaboration-mark.png' },
};
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|cookie|token|session|telegram)[=:]\s*\S+/i;
function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; }
function addDays(date, offset) { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); }
function required(value) { return typeof value === 'string' && value.trim() ? null : '此欄位不可留白。'; }
function safePublicText(value) { return secretPattern.test(value) ? '偵測到可能的密碼、cookie、token、session 或私鑰；秘密資料不可寫入公開設定。' : null; }

export function buildProjectConfig(input) {
  for (const key of ['account', 'seriesTitle', 'contestTag', 'contest', 'githubOwner', 'githubRepo']) if (required(input?.[key])) throw new Error(`${key} is required`);
  if (!validDate(input.day1Date)) throw new Error('day1Date must be an explicit YYYY-MM-DD date');
  if (!/^[A-Za-z0-9_.-]+$/.test(input.githubOwner) || !/^[A-Za-z0-9_.-]+$/.test(input.githubRepo)) throw new Error('GitHub owner and repo may contain only letters, numbers, dot, underscore, and hyphen');
  for (const value of Object.values(input)) if (typeof value === 'string' && safePublicText(value)) throw new Error(safePublicText(value));
  const siteUrl = `https://${input.githubOwner}.github.io`;
  const base = input.githubRepo === `${input.githubOwner}.github.io` ? '' : `/${input.githubRepo}`;
  const template = structuredClone(DEFAULT_TEMPLATE);
  const config = {
    schemaVersion: 2, initialized: true,
    publication: { type: 'ithome-ironman', totalDays: 30, account: input.account.trim(), seriesTitle: input.seriesTitle.trim(), contestTag: input.contestTag.trim(), contest: input.contest.trim(), repository: `${input.githubOwner}/${input.githubRepo}`, seriesKey: input.githubRepo, day1Date: input.day1Date, schedule: Array.from({ length: 30 }, (_, index) => ({ day: index + 1, date: addDays(input.day1Date, index) })) },
    site: input.site ?? template.site, learningMap: input.learningMap ?? template.learningMap,
    extensions: input.extensions ?? template.extensions, brand: input.brand ?? template.brand,
    seo: input.seo ?? { ...template.seo, siteName: input.seriesTitle.trim(), authorName: input.account.trim() },
    githubPages: { site: siteUrl, base, publicUrl: `${siteUrl}${base}` },
  };
  const errors = validateProjectConfig(config, { requireInitialized: true });
  if (errors.length) throw new Error(`Generated invalid config: ${errors.join(', ')}`);
  return config;
}
export async function writeProjectConfig(target, config) { await saveProjectConfig(target, config); }
export function parseSetupArgs(argv) {
  const values = {};
  const allowed = new Set([...REQUIRED, ...OPTIONAL]);
  for (let index = 0; index < argv.length; index += 1) { const token = argv[index]; if (!token.startsWith('--')) throw new Error(`Unknown argument: ${token}`); const key = token.slice(2); if (!allowed.has(key)) throw new Error(`Unknown argument: ${token}`); const value = argv[++index]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`); if (safePublicText(value)) throw new Error(safePublicText(value)); values[key] = value; }
  for (const key of REQUIRED) if (!values[key]) throw new Error(`--${key} is required`);
  const template = structuredClone(DEFAULT_TEMPLATE);
  if (values['site-tagline']) template.site.tagline = values['site-tagline'];
  if (values['home-kicker']) template.site.home.kicker = values['home-kicker'];
  if (values['home-lead']) template.site.home.lead = values['home-lead'];
  if (values['home-summary']) template.site.home.summary = values['home-summary'];
  if (values['seo-site-name']) template.seo.siteName = values['seo-site-name'];
  else template.seo.siteName = values['series-title'];
  if (values['seo-author-name']) template.seo.authorName = values['seo-author-name'];
  else template.seo.authorName = values.account;
  if (values['seo-social-image']) template.seo.socialImage = values['seo-social-image'];
  if (values['brand-light']) template.brand.mark.light = values['brand-light'];
  if (values['brand-dark']) template.brand.mark.dark = values['brand-dark'];
  if (values['brand-alt']) template.brand.mark.alt = values['brand-alt'];
  if (values.favicon) template.brand.favicon = values.favicon;
  if (values['apple-touch-icon']) template.brand.appleTouchIcon = values['apple-touch-icon'];
  return {
    account: values.account, seriesTitle: values['series-title'], contestTag: values['contest-tag'],
    contest: values.contest, day1Date: values['day1-date'], githubOwner: values['github-owner'],
    githubRepo: values['github-repo'], ...template,
  };
}

function parseNonInteractiveCommand(argv) {
  const actionTokens = new Set([...ACTIONS].map((action) => `--${action}`));
  const actions = argv.filter((token) => actionTokens.has(token)).map((token) => token.slice(2));
  if (actions.length !== 1) throw new Error('Choose exactly one action: --preview, --write, or --check.');
  const action = actions[0];
  const remaining = argv.filter((token) => !actionTokens.has(token));
  if (action === 'check' && remaining.length > 0) throw new Error('--check does not accept setup values.');
  return { action, remaining };
}

export async function runNonInteractiveSetup(argv, {
  write = (config) => writeProjectConfig(CONFIG_PATH, config),
  load = async () => JSON.parse(await readFile(CONFIG_PATH, 'utf8')),
} = {}) {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const { action, remaining } = parseNonInteractiveCommand(normalizedArgv);
  if (action === 'check') {
    const config = await load();
    const errors = validateProjectConfig(config, { requireInitialized: true });
    return { status: errors.length === 0 ? 'configured' : 'incomplete', errors };
  }
  const config = buildProjectConfig(parseSetupArgs(remaining));
  if (action === 'preview') return { status: 'preview', config };
  await write(config);
  return { status: 'configured', config };
}
async function askValue({ ask, output, prompt, validate = required, defaultValue }) {
  while (true) {
    const answer = (await ask(prompt)).trim();
    const value = answer || defaultValue || '';
    const error = safePublicText(value) ?? await validate(value);
    if (!error) return value;
    output(`輸入格式不正確：${error}`);
    output('請重新輸入。');
  }
}
async function askAsset({ ask, output, label, defaultValue, publicDir }) {
  return askValue({ ask, output, defaultValue, prompt: `${label}\n請輸入 public/ 底下的相對路徑；例如 assets/series-mark.png 會對應 public/assets/series-mark.png。\n不可使用網址、絕對路徑或 ../。直接按 Enter 使用：${defaultValue}\n請輸入：`, validate: async (value) => { const status = await publicAssetStatus(value, publicDir); return status.valid && status.exists ? null : `找不到或不允許此路徑：public/${value}`; } });
}
export async function runInteractiveSetup({ ask, output, write = (config) => writeProjectConfig(CONFIG_PATH, config), publicDir = PUBLIC_DIR }) {
  if (![ask, output, write].every((value) => typeof value === 'function')) throw new Error('interactive setup requires ask, output, and write functions');
  output('iThome 鐵人賽模板初始化');
  output('以下只會詢問可公開、可提交的設定；請勿輸入密碼、cookie、token、登入 session、Chrome profile、Telegram 憑證或私鑰。');
  const mode = await askValue({ ask, output, prompt: '設定方式（必填）\n輸入 quick 使用預設網站文案與章節；輸入 full 逐項自訂。\n直接按 Enter 使用：quick\n請輸入：', defaultValue: 'quick', validate: (value) => ['quick', 'full'].includes(value) ? null : '只能輸入 quick 或 full。' });
  const input = {};
  const fields = [
    ['account', '公開 iThome 帳號（必填）\n只輸入公開帳號，例如 gcake119。\n請輸入：', required],
    ['seriesTitle', '完整系列名稱（必填）\n會顯示在網站標題與 RSS，例如：我的三十天學習挑戰。\n請輸入：', required],
    ['contestTag', 'iThome 畫面顯示的 contest tag（必填）\n例如：18th鐵人賽。\n請輸入：', required],
    ['contest', '穩定的 contest 識別（必填）\n例如：18th-ironman-2026。\n請輸入：', required],
    ['day1Date', 'Day 1 日期（必填）\n格式必須是 YYYY-MM-DD，例如：2026-09-01。程式會產生連續三十天。\n請輸入：', (value) => validDate(value) ? null : '日期必須是有效的 YYYY-MM-DD，例如 2026-09-01。'],
    ['githubOwner', 'GitHub owner（必填）\n只輸入帳號或組織名稱，例如：example-user。\n請輸入：', (value) => /^[A-Za-z0-9_.-]+$/.test(value) ? null : '只能使用英數字、點、底線與連字號。'],
    ['githubRepo', 'GitHub repo 名稱（必填）\n只輸入 repo 名稱，例如：my-ironman；不要貼完整網址。\n請輸入：', (value) => /^[A-Za-z0-9_.-]+$/.test(value) ? null : '只能使用英數字、點、底線與連字號。'],
  ];
  for (const [key, prompt, validate] of fields) input[key] = await askValue({ ask, output, prompt, validate });
  if (mode === 'full') {
    const template = structuredClone(DEFAULT_TEMPLATE);
    template.site.tagline = await askValue({ ask, output, prompt: `網站副標（必填）\n例如：一份陪你完成三十天挑戰的學習誌。\n直接按 Enter 使用：${template.site.tagline}\n請輸入：`, defaultValue: template.site.tagline });
    template.learningMap.title = await askValue({ ask, output, prompt: `學習地圖名稱（必填）\n例如：三十天學習地圖。\n直接按 Enter 使用：${template.learningMap.title}\n請輸入：`, defaultValue: template.learningMap.title });
    template.seo.siteName = await askValue({ ask, output, prompt: `搜尋結果使用的短站名（必填）\n例如：我的三十天學習誌。\n直接按 Enter 使用：${template.seo.siteName}\n請輸入：`, defaultValue: template.seo.siteName });
    template.seo.authorName = await askValue({ ask, output, prompt: `公開作者名稱（必填）\n會出現在文章結構化資料中；請勿填入非公開個資。\n直接按 Enter 使用：${template.seo.authorName}\n請輸入：`, defaultValue: template.seo.authorName });
    template.seo.socialImage = await askAsset({ ask, output, label: '搜尋與社群分享預設圖片', defaultValue: template.seo.socialImage, publicDir });
    template.brand.mark.light = await askAsset({ ask, output, label: '亮色模式標誌', defaultValue: template.brand.mark.light, publicDir });
    template.brand.mark.dark = await askAsset({ ask, output, label: '暗色模式標誌', defaultValue: template.brand.mark.dark, publicDir });
    template.brand.mark.alt = await askValue({ ask, output, prompt: `標誌文字說明（必填）\n提供給螢幕閱讀器，例如：我的鐵人賽系列標誌。\n直接按 Enter 使用：${template.brand.mark.alt}\n請輸入：`, defaultValue: template.brand.mark.alt });
    Object.assign(input, template);
  }
  const config = buildProjectConfig(input);
  output(''); output('請確認即將寫入 ithome.config.json：');
  output('【iThome 鐵人賽】'); output(`帳號：${config.publication.account}`); output(`系列名稱：${config.publication.seriesTitle}`); output(`Day 1：${config.publication.schedule[0].date}`); output(`Day 30：${config.publication.schedule[29].date}`);
  output('【網站與學習地圖】'); output(`網站副標：${config.site.tagline}`); output(`學習地圖：${config.learningMap.title}`); output(`章節數：${config.learningMap.sections.length}`); config.learningMap.sections.forEach((section) => output(`－${section.title}`));
  output('【延伸閱讀】'); output(`${config.extensions.enabled ? '已啟用' : '未啟用'}：${config.extensions.title}`);
  output('【品牌資產】'); output(`亮色標誌：public/${config.brand.mark.light}`); output(`暗色標誌：public/${config.brand.mark.dark}`); output(`標誌文字說明：${config.brand.mark.alt}`);
  output('【搜尋與分享】'); output(`短站名：${config.seo.siteName}`); output(`公開作者：${config.seo.authorName}`); output(`預設圖片：public/${config.seo.socialImage}`);
  output('【GitHub Pages】'); output(config.githubPages.publicUrl);
  const confirmed = (await ask('以上資料正確並寫入 ithome.config.json？（yes／no）：')).trim().toLowerCase();
  if (!['yes', 'y'].includes(confirmed)) { output('已取消，沒有修改設定檔。'); return { status: 'cancelled' }; }
  await write(config); output('初始化完成。請執行 pnpm test:ithome、pnpm check、pnpm build，再檢查 ithome.config.json。'); return { status: 'configured', config };
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive setup requires a terminal. For an Agent or automation, pass all documented --arguments.');
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try { await runInteractiveSetup({ ask: (prompt) => terminal.question(prompt), output: (line) => process.stdout.write(`${line}\n`) }); } finally { terminal.close(); }
    return;
  }
  const result = await runNonInteractiveSetup(argv);
  if (result.status === 'incomplete') process.exitCode = 2;
  const summary = result.config ? {
    status: result.status, path: resolve(CONFIG_PATH), publicUrl: result.config.githubPages.publicUrl,
    day1Date: result.config.publication.day1Date, day30Date: result.config.publication.schedule[29].date,
    ...(result.status === 'preview' ? { config: result.config } : {}),
  } : result;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`[ithome:setup] ${error.message}\n`); process.exitCode = 1; });
