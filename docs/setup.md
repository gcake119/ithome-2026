# 完整設定與內容替換

這份文件承接 [README](../README.md) 的首次設定流程，說明 setup 的完整用法、SEO／品牌欄位、文章格式與交給 AI Agent 的進階工作。

## 資料邊界

- `ithome.config.json`：網站與發布工具實際讀取的正式公開設定，應提交到 Git。
- `ithome.config.example.json`：供 fork 使用者參考的欄位範例，程式不會讀取或自動同步。
- `src/content/ironman/day-01.md`～`day-30.md`：主系列唯一正式來源。
- `src/content/extensions/*.md`：延伸閱讀，不占 Day 編號，也不進入 publisher。
- Chrome profile、cookie、登入 session、token、Telegram credential 與 runtime state：只能放在 repo 外。

Fork 會保留原 repo 的正式設定與文章，不會自動清空。複製範例設定會覆蓋原有設定，但不會重設文章。

## 互動式設定

```bash
pnpm install
pnpm ithome:setup
```

quick 模式詢問 7 項必填公開資料；full 模式另詢問首頁、SEO 與品牌資料。兩種模式都會先顯示 Pages 網址、SEO／品牌摘要與 Day 1～30 日期表。只有最後回答 `yes` 或 `y` 才會寫入。

Day 1 必須使用 `YYYY-MM-DD` 明確提供；程式不會依今天、文章順序或 iThome 畫面猜測。

## Agent 非互動設定

Agent 必須先預覽，再取得使用者明確確認，最後才寫入：

```bash
pnpm ithome:setup -- --preview \
  --account "你的公開 iThome 帳號" \
  --series-title "你的完整系列名稱" \
  --contest-tag "畫面顯示的比賽標籤" \
  --contest "穩定識別，例如 18th-ironman-2026" \
  --day1-date "2026-09-01" \
  --github-owner "YOUR_GITHUB_NAME" \
  --github-repo "YOUR_REPO" \
  --site-tagline "網站副標" \
  --home-kicker "首頁眉題" \
  --home-lead "首頁導言" \
  --home-summary "首頁摘要" \
  --seo-site-name "搜尋結果短站名" \
  --seo-author-name "公開作者名稱" \
  --seo-social-image "assets/ai-collaboration-mark.png" \
  --brand-light "assets/ai-collaboration-mark.png" \
  --brand-dark "assets/ai-collaboration-mark-dark.png" \
  --brand-alt "系列標誌文字說明" \
  --favicon "favicon.svg" \
  --apple-touch-icon "apple-touch-icon.png"
```

預覽正確後，把同一組參數的 `--preview` 改成 `--write`。非互動模式必須明確選擇 `--preview`、`--write` 或 `--check`，不能同時指定多個動作。

首頁、SEO 與品牌參數可省略；省略時使用模板預設文案、系列名稱作為 SEO 短站名、iThome 帳號作為公開作者。圖片必須是已存在於 `public/` 的安全相對路徑。

完成後檢查：

```bash
pnpm ithome:setup -- --check
```

`configured` 表示正式設定結構完整；`incomplete` 會列出缺少或不合法的欄位。

## SEO 與品牌

網站層資料寫在 `ithome.config.json`：

```json
"seo": {
  "siteName": "我的三十天學習誌",
  "authorName": "公開作者名稱",
  "socialImage": "assets/my-series-cover.png"
}
```

`socialImage` 是相對於 `public/` 的路徑。設定完成後，網站會自動產生頁面標題、搜尋摘要、Canonical URL、Open Graph、Twitter／X Card、JSON-LD、RSS 與 Sitemap。

品牌圖片同樣放在 `public/`，並由 `brand`、`seo.socialImage` 與替代文字引用。設定欄位新增或移除時，才需要同步維護 `ithome.config.example.json` 的結構；只修改個人文案時不必同步範例值。

## 主系列文章

每篇至少包含：

```yaml
---
title: "Day 01｜文章標題"
description: "用一至兩句話說明這篇文章的問題與收穫。"
publishDate: 2026-09-01
updatedDate: 2026-09-03 # 沒有更新時可省略
draft: true
day: 1
section: "foundation"
---

文章正文
```

- 檔名、`day`、`publishDate` 與設定日期表必須一致。
- `section` 必須對應 `learningMap.sections` 的穩定 ID。
- `description` 要描述單篇內容，不要重複貼上章節簡介。
- 未準備公開時保持 `draft: true`。
- iThome 同步連結由 payload 自動加入，不要寫回 Markdown。

延伸閱讀範例：

```yaml
---
title: "參賽心得"
slug: "ironman-retrospective"
description: "完成三十天後的回顧"
publishDate: 2026-10-15
draft: true
relatedDays: [1, 30]
---
```

`relatedDays` 可省略；填入時只能指向 Day 1～30。

## 本機驗證

```bash
pnpm ithome:setup -- --check
pnpm test:ithome
pnpm check
pnpm build
pnpm ithome:prepare -- --day 1 --json
git diff --check
```

`ithome:prepare` 只讀 repo 並產生 payload，不會開 Chrome、登入或發布。

## 交給 Agent 替換內容

可把下面指令交給能存取 repo 的 Agent：

```text
請先閱讀 README.md、docs/setup.md、AGENTS.md（如有），並執行 git status 保護現有變更；不可 reset、restore、checkout 或 clean。

先唯讀盤點 ithome.config.json、Day 1～30、延伸文章、品牌素材與目前驗證結果，區分模板內容和已個人化內容。

只使用我提供的文章替換 src/content/ironman/day-01.md 到 day-30.md；缺少的 Day 請列出，不可虛構。檔名、day、publishDate、section 與設定日期表必須一致。未經我確認公開的文章保持 draft: true，不要把 iThome 同步連結寫回 Markdown。

完成後執行 pnpm ithome:setup -- --check、pnpm test:ithome、pnpm check、pnpm build、pnpm ithome:prepare -- --day 1 --json 與 git diff --check，並掃描 repo 是否誤含密碼、cookie、token、session、Chrome profile、Telegram credential、真實草稿 ID、個人絕對路徑或 runtime state。

回報修改檔案、驗證結果、Pages 預期網址、文章／素材缺漏與尚未執行的外部操作。未經另外明確授權，不可 commit、push、部署、登入 iThome、建立草稿、發布文章或安裝排程。
```

下一步：[部署 GitHub Pages](deployment.md)。
