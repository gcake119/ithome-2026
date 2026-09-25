# iThome 鐵人賽 30 天發布模板

這是一套可以 fork 成自己專案的 iThome 鐵人賽網站模板。第一次使用不需要先理解 Astro、SEO 或 publisher：準備公開資料後，可以交給 AI Agent 設定，也可以自己執行互動式精靈。

完成基本設定後，你會得到：

- 自己的系列名稱、首頁、三十天學習地圖與文章網址。
- 可部署到 GitHub Pages 的靜態網站。
- RSS、Sitemap、搜尋摘要與社群分享資訊。
- 經測試確認的 Day 1～30 日期表與 iThome payload。

> 基本設定不會登入 iThome、不會發布文章、不會安裝排程，也不會取得密碼、cookie、token 或登入 session。GitHub Pages 公開、iThome 發布與自動排程是後續分開驗收的階段。

## 開始前準備

需要 Node.js 24、pnpm 11.24，以及以下公開資料：

| 必填資料 | 說明 | 範例 |
| --- | --- | --- |
| iThome 帳號 | 公開頁面顯示的帳號 | `YOUR_ITHOME_NAME` |
| 系列名稱 | 報名時使用的完整名稱 | `我的 30 天系列` |
| contest tag | iThome 畫面顯示的標籤 | `18th鐵人賽` |
| contest 識別 | repo 內使用的穩定文字 | `18th-ironman-2026` |
| Day 1 日期 | `YYYY-MM-DD`，不會自動猜測 | `2026-09-01` |
| GitHub owner | GitHub 帳號或組織 | `YOUR_GITHUB_NAME` |
| GitHub repo | fork 後的 repo 名稱 | `YOUR_REPO` |

首頁文案、SEO 名稱與品牌圖片可以一起提供；若尚未決定，可以明確選擇模板預設值，之後再修改。

## 路徑 A：交給 AI Agent（建議）

Fork 並 clone 後，把下面整段交給可以存取 repo 的 Agent：

```text
請協助我完成這個 iThome 鐵人賽模板的基本設定。

先完整閱讀 README.md 與 docs/setup.md，執行 git status，保護現有變更；不可 reset、restore、checkout 或 clean。

請一次只問我一項尚未提供的必填公開資料：
1. iThome 公開帳號
2. 完整系列名稱
3. contest tag
4. contest 識別
5. Day 1 的 YYYY-MM-DD 日期
6. GitHub owner
7. GitHub repo

再詢問我要使用模板預設的首頁、SEO 與品牌設定，還是逐項提供自訂值。不可猜測資料，不可要求或寫入密碼、cookie、token、session、Chrome profile、Telegram 憑證或私鑰。

資料齊全後：
1. 先以 pnpm ithome:setup -- --preview 加上完整參數產生預覽，不可寫檔。
2. 向我顯示系列名稱、Day 1、Day 30、Pages 網址、首頁文案、SEO 與品牌摘要。
3. 等我明確確認後，才把相同參數的 --preview 改成 --write。
4. 執行 pnpm ithome:setup -- --check、pnpm test:ithome、pnpm check、pnpm build 與 git diff --check。
5. 回報修改檔案、驗證結果、Pages 預期網址、仍需替換的文章／素材，以及尚未執行的外部操作。

沒有我的另外授權，不可 commit、push、部署、修改 GitHub 設定、登入 iThome、建立草稿、發布文章、安裝本機排程或操作 Hermes。
```

Agent 至少要回報 `ithome.config.json` 已通過 `--check`，以及測試、型別檢查和建置結果。只回覆「設定好了」不算完成。

## 路徑 B：自己操作

```bash
git clone https://github.com/YOUR_GITHUB_NAME/YOUR_REPO.git
cd YOUR_REPO
pnpm install
pnpm ithome:setup
pnpm ithome:setup -- --check
pnpm test:ithome
pnpm check
pnpm build
```

`pnpm ithome:setup` 會逐題說明格式，最後顯示完整預覽；只有回答 `yes` 或 `y` 才會寫入。第一次建議使用 quick 模式，先完成可運作設定。

## 換成自己的文章

- 主系列放在 `src/content/ironman/day-01.md`～`day-30.md`。
- 延伸閱讀是選配功能，預設關閉且不渲染。啟用後可選 `local`：文章寫在 `src/content/extensions/`；或 `external`：首頁與 Day 30 只放一張卡片，連到外部部落格的後續系列。兩種模式都不占 Day 編號，也不會進入 iThome publisher。
- 尚未準備公開的文章保持 `draft: true`。
- Day、檔名、日期及 `ithome.config.json` 的日期表必須一致。
- iThome 同步連結由 payload 自動加入，不要寫回 Markdown。

每篇主系列文章至少包含：

```yaml
---
title: "Day 01｜文章標題"
description: "這篇文章處理的問題與讀者會得到什麼。"
publishDate: 2026-09-01
draft: true
day: 1
section: "foundation"
---

文章正文
```

完整的初始化參數、SEO、品牌、文章格式與 Agent 工作指令都在 [設定指南](docs/setup.md)。

## 怎樣算基本設定完成？

- `pnpm ithome:setup -- --check` 回報 `configured`。
- `ithome.config.json` 已換成自己的公開資料，Day 1～30 日期連續。
- `pnpm test:ithome`、`pnpm check`、`pnpm build` 全部成功。
- 已列出尚未替換的文章與品牌素材。
- repo 內沒有登入資料、秘密或 runtime state。

這只代表 repo 基本設定與本機驗證完成，不代表 GitHub Pages 已公開、iThome 已登入、自動發布已啟用或 Hermes 已安裝。

## 接下來做什麼？

每個階段都要分開設定與驗收；前一階段成功不代表後面的階段已啟用。

1. [完整設定與內容替換](docs/setup.md)：setup 參數、SEO、品牌、文章與本機驗證。
2. [部署 GitHub Pages](docs/deployment.md)：啟用 Pages、確認 workflow 與實際公開網址。
3. [設定 iThome publisher](docs/publisher.md)：選配的專用 Chrome、草稿、09:30 本機發布排程與安全規則。
4. [設定 Hermes 提醒與監控](docs/hermes.md)：選配的 09:00 提醒、19:00／22:30 公開頁面檢查。
5. [組合發布與監控自動化](docs/automation.md)：LaunchAgent、Hermes、Codex heartbeat、Computer Use 與背景 RSS 驗證的分工。

只需要個人網站時，完成前兩項即可。

## 模板包含什麼？

| 範圍 | 已提供 | 仍要自行完成 |
| --- | --- | --- |
| 公開設定 | 設定檔、範例與 setup 精靈 | 帳號、系列、日期、首頁、SEO、品牌 |
| 內容 | Day 1～30 與延伸文章格式 | 逐篇換成自己的文章與摘要 |
| 網站 | Astro、RSS、Sitemap、SEO、響應式版型 | 視需要調整外觀並部署 |
| 驗證 | 設定、文章、網址、payload 與建置測試 | 在本機與 GitHub Actions 執行 |
| iThome 發布 | payload、稽核技能與本機 publisher | 另行登入、安裝排程並真實驗收 |
| 異常通知 | event、bootstrap 與 Hermes 契約 | 另行安裝通知端與驗收 |

Fork 會保留模板目前的正式設定與文章，不會自動清空。務必先完成個人化，再公開網站。

## 安全邊界

- repo 只保存文章與公開設定。
- cookie、Chrome profile、session、Telegram credential、事件目錄與私有狀態必須留在 repo 外。
- setup 不會詢問秘密；Agent 必須先 preview，取得確認後才能 write。
- 測試與 `ithome:prepare` 不會登入或發布。
- 未另外明確授權，不得 commit、push、部署、操作真實 iThome 或安裝排程。
- 發布遇到登入失效、重複草稿、Cloudflare、CAPTCHA、429、頁面改版或結果不明時必須停止，不能猜測或重試 publish click。

## 名詞速查

- **repo**：這個專案資料夾，也是文章與公開設定的正式來源。
- **fork**：在自己的 GitHub 帳號複製一份 repo。
- **payload**：由 Markdown 產生、準備交給 iThome 的發布資料；不等於已發布。
- **publisher**：在本機核對並發布既有 iThome 草稿的程式。
- **Chrome profile**：Chrome 保存登入狀態的本機資料夾，必須留在 repo 外。
- **fail closed**：遇到不確定狀況就停止，避免重複或錯誤發布。
- **dry-run**：只驗證流程，不進行正式寫入或發布。

更完整的維護資料請看 [產品定位](PRODUCT.md)、[安全規則](SECURITY.md)、[貢獻指南](CONTRIBUTING.md) 與 [交接文件](docs/handoff/README.md)。
