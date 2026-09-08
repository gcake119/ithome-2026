# 2026 iThome 鐵人賽｜文章同步與自動發文交接

> 本文件是 repo 端與 Codex Computer Use 的發布安全交接。文章 Markdown 是唯一正式內容來源；不得由發布流程自行改寫 title、body 或 canonical URL。

## 1. Repo 與內容來源

- Repository：`gcake119/ithome-2026`
- 個人連載網站：`https://gcake119.github.io/ithome-2026/`
- 現行正式文章來源：`src/content/ironman/day-01.md`～`day-30.md`
- 固定文章網址：`/day/01/`～`/day/30/`

舊交接資料曾使用 `src/content/posts/`；目前 repo 已由 Astro collection 與 `scripts/ithome/prepare.mjs` 明確使用 `src/content/ironman/`，後續不得再建立第二份文章來源。

## 2. Publishing payload

每篇以：

```bash
pnpm ithome:prepare -- --day N --json
```

產生 machine-readable payload，至少包含：

- `day`
- `dayString`
- `title`
- `body`
- `canonicalUrl`
- `syncLine`
- `publishDate`

發布流程會動態在正文第一行加入：

```text
本文同步刊載於個人連載網站：https://gcake119.github.io/ithome-2026/day/NN/
```

此同步行不得寫回文章 Markdown。

## 3. Repo 與 Computer Use 分工

Repo 負責：

- 30 篇 Markdown
- publishDate 與 Day 對應 schedule
- canonical URL
- publishing payload
- 系列章節 metadata

Codex Computer Use 負責：

```text
import-drafts --all
import-drafts --day N
audit-drafts
repair-drafts --all
repair-drafts --day N
publish-day --day N
```

Codex Computer Use 不得自行改寫文章。

## 4. 賽前草稿能力閘門

`import-drafts --all` 在賽前多草稿能力尚未實測通過前保持停用。

先以 Day 01 與 Day 02 驗證：

- Day 01 儲存草稿後，是否可建立不同內容的 Day 02 草稿。
- 兩篇是否都能個別辨識與開啟。
- Day 02 是否不會覆蓋 Day 01。
- 全程不需要 series id，且沒有正式發表。

若證據不足：

```text
先完成 Day 01～30 本機 payload inventory
→ iThome 最多只建立 Day 01 草稿
→ Day 1 正式發布並完成 bootstrap
→ 再驗證／匯入 Day 02～30
```

所有草稿匯入只能點「儲存草稿」，不得點「發表文章」。

## 5. audit-drafts

至少檢查：

- Day 01～30 是否存在
- missing
- duplicate
- title mismatch
- canonical URL mismatch
- 是否仍是草稿
- 是否已有文章被公開

Day 1 bootstrap 前不得猜 series id；公開系列狀態記為 `not_available_pre_bootstrap`。

狀態至少包含：`complete`、`incomplete`、`conflict`、`failed`。

## 6. repair-drafts

- `missing`：可自動補建。
- `duplicate`：只回報，不自動刪除。
- `mismatch`：只回報，不自動覆寫。
- 已公開文章：不得因 repair 自動修改。

repair 後必須再執行 audit；只有 audit 可以確認 `30/30 complete`。

## 7. Day 1 bootstrap

```text
publish-day --day 1
→ 驗證唯一且內容正確的 Day 1 草稿
→ 確認尚未公開
→ 最多點一次「發表文章」
→ 驗證 Day 1 公開文章
→ 從文章標題上方實際系列連結取得 series URL
→ 驗證系列頁與 Day 1 身分
→ 寫出 verified bootstrap state
```

series URL／seriesId 不得自行推測。

建議 verified state：

`/Users/Shared/ithome-ironman-bridge/state/series-bootstrap.json`

只有 `status: "verified"` 的 state 可供 Day 2～30 與 Hermes 使用。

## 8. Day 2～30

每天只執行指定的：

```text
publish-day --day N
```

流程：驗證 bootstrap state → 找唯一 Day N 草稿 → 驗證 title/canonical URL → 確認尚未公開 → 最多一次 publish click → 驗證公開文章。

`publish-day` 不負責建立新草稿。若缺稿：停止 → `repair-drafts --day N` → audit → 再重新執行 publish。

## 9. 強制安全規則

1. 不得自行修改 title、body、canonical URL。
2. Day 必須來自使用者明確指定或明確排程，不得猜測。
3. 每次 `publish-day` 最多一次 publish click；點擊後狀態不確定時，不得再點，先唯讀確認公開頁。
4. 不得猜 series id；必須從 Day 1 公開文章標題上方的實際系列連結取得並驗證。
5. 不得自動刪除草稿、重複稿或已公開文章。
6. 遇到 Cloudflare、Too Many Requests、HTTP 429、登入失效或頁面狀態不確定：立即停止、回報、不持續重試、不繞過反自動化機制。
7. Repo 階段不得直接操作 iThome UI；正式 UI 操作交由 Codex Computer Use。

## 10. Hermes 邊界

Codex：不取得 Telegram Bot credential，只產生 machine-readable bootstrap/audit/publish state。

Hermes：不取得 iThome session、不操作 iThome，只讀 state 並負責 Telegram 通知與公開頁 watchdog。

Day 1 verified bootstrap state 尚未建立前，Hermes 不得猜 series URL。

## 11. 正式交接入口

Repo 完成文章與網站交接後，Codex Computer Use 應從本 repo 的 `.agents/skills/ithome-ironman-publisher/` 以及本文件開始，先建立／驗證 payload inventory，再進行草稿能力測試、audit、repair 與發布流程。不得跳過上述能力閘門與安全規則。
