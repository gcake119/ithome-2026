# iThome publishing payload

這個目錄只負責從 repo 內的 Markdown 產生 iThome 發文用 payload，不直接操作 iThome 網站。

## 設計

- `src/content/ironman/day-NN.md` 是鐵人賽文章唯一來源。
- `src/content/extensions/*.md` 是延伸閱讀來源，不進入 publisher。
- iThome 專用第一行會在輸出 payload 時動態加入，不寫回原始 Markdown。
- 產生的第一行使用明確 Markdown 連結：`本文同步刊載於[個人連載網站](<canonicalUrl>)`。
- GitHub Pages 文章網址由 `ithome.config.json` 的 `githubPages.publicUrl` 與 Day 編號推導。
- Codex／Computer Use 可處理人工確認的發文與異常復原；平台要求的正式發文 action-time confirmation 不能由 repo 規則取消。
- 無人值守發布的目標路徑是獨立本機 runner 與本機 browser adapter，不透過 Computer Use，也不把 iThome credential 交給 Hermes。
- Repo 不保存 iThome Cookie、session、browser state 或其他登入憑證。

## 指令

```bash
pnpm ithome:prepare -- --day 5
pnpm ithome:prepare -- --day 5 --json
```

`ithome:prepare` 不會開瀏覽器，也不會對 iThome 發出任何 request。

第一次使用前，必須先執行 README 所列的 `pnpm ithome:setup`。未帶參數時會啟動互動式 CLI 精靈；精靈提供 quick 與 full 模式，每題都會提示格式、範例、預設值或 `public/` 相對路徑。

Agent／自動化必須明確選擇一個動作：

- `--preview`：驗證完整參數並輸出候選設定，不寫檔。
- `--write`：使用已確認的相同參數寫入 `ithome.config.json`。
- `--check`：唯讀檢查目前正式設定，回報 `configured` 或 `incomplete`。

非互動模式可傳入首頁、SEO 與品牌參數；未指定時使用安全的模板預設值。`--preview`、`--write` 與 `--check` 必須擇一，避免 Agent 未經預覽直接覆寫設定。未完成公開身分、Day 1 日期、30 天日期表與 Pages 網址設定時，payload 會 fail closed。

主系列只讀取 `src/content/ironman/day-NN.md`。位於 `src/content/extensions/` 的延伸閱讀不屬於 Day 1～30，不得進入 payload、草稿 inventory 或 publisher。

一般模式會輸出人類可讀的標題、網址與正文預覽；`--json` 則輸出可直接交給 Computer Use agent 的結構化 payload。

## 發布分工

```text
src/content/ironman/day-NN.md
        ↓
pnpm ithome:prepare -- --day N --json
        ↓
Codex／Computer Use（人工確認）或獨立本機 runner（目標）
        ↓
iThome 草稿 / 發表
        ↓
Hermes watchdog 驗證公開頁
```

兩種發布路徑都應完全使用 payload 的標題與正文，不自行改寫文章內容。獨立 runner 尚待真實 browser adapter 與開賽驗收，不能視為目前已啟用。
