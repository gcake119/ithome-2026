# 發布與監控自動化

本頁說明 fork 後可以採用的排程組合。repo 提供的是可審查的程式、prompt 與範例，不會自動安裝服務，也不包含任何人的帳號路徑、Cookie、Chrome profile、Telegram 憑證或 runtime state。

## 元件怎麼分工

| 元件 | 適合做什麼 | 不適合做什麼 | 螢幕鎖定時 |
| --- | --- | --- | --- |
| Playwright publisher | 09:30 核對唯一草稿並最多點一次發布 | 重複點擊、不確定後再次發布、Telegram | 需依專用 Chrome 與本機環境實測 |
| 背景公開 watchdog | 以系列頁／官方 RSS＋文章頁驗證標題、日期、網址與 canonical | 登入、讀草稿、按發布 | 可以 |
| Hermes | 09:00 提醒、19:00／22:30 watchdog、既有 Gateway 推播 | 登入 iThome、持有 Cookie、第二個 poller | 可以 |
| Codex heartbeat | 選配的定時唯讀接手與人工協作 | 成為第二個 publisher、持有 Telegram 憑證 | HTTP／RSS 可以；Computer Use 不行 |
| Computer Use | 已解鎖時查看登入頁面、系列分頁與文章頁 | 鎖定桌面、自動排程發布、繞過 CAPTCHA | 不可以 |

## 建議組合

### 只要自動發布與本機紀錄

安裝 [publisher](publisher.md) 的 09:30 LaunchAgent，再安裝 19:00／22:30 背景公開 watchdog。異常只會寫入設定的 log，不需要 Hermes。

### 需要 Telegram 異常通知

publisher 仍由發布帳號執行。Hermes 只讀 event／bootstrap，負責 09:00、19:00、22:30 三個排程，並把非空通知交給既有 Gateway。不要再建立第二個 Telegram poller。

### 需要 Codex 定時接手

在上述任一組合之外，選配 Codex heartbeat。可複製的 prompt 位於：

`.agents/skills/ithome-ironman-publisher/examples/codex/public-verification-heartbeat.md`

建議排程為比賽期間每日 10:00～23:00 每小時一次。建立後必須查看產品顯示的下一次執行時間，確認真的是 `Asia/Taipei`；不要只看原始 RRULE 猜測時區。

Codex 的檢查順序是：

1. 當日已通知 verified，或 watcher state 已有同日 `lastVerified`：立即停止，當日不再檢查。
2. 有 verified publisher event：保持安靜。
3. 有點擊收據或 `post_publish_unverified`：只做背景 HTTP／RSS 公開驗證。
4. 公開證據不足，而且 Mac 已解鎖：才使用 Computer Use 唯讀查看。
5. 已有點擊收據：任何情況都不得再次點擊發布。

## 可直接複製的檔案

macOS publisher：

- `.agents/skills/ithome-ironman-publisher/examples/macos/run-publisher.zsh`
- `.agents/skills/ithome-ironman-publisher/examples/macos/com.example.ithome-ironman-publisher.plist`

螢幕鎖定仍可執行的背景 verifier：

- `.agents/skills/ithome-ironman-publisher/examples/macos/run-public-watchdog.zsh`
- `.agents/skills/ithome-ironman-publisher/examples/macos/com.example.ithome-public-watchdog-1900.plist`
- `.agents/skills/ithome-ironman-publisher/examples/macos/com.example.ithome-public-watchdog-2230.plist`

Codex heartbeat：

- `.agents/skills/ithome-ironman-publisher/examples/codex/public-verification-heartbeat.md`

先複製到 repo 外並替換 placeholder，再執行：

```bash
zsh -n /實際路徑/run-public-watchdog.zsh
plutil -lint /實際路徑/com.example.ithome-public-watchdog-1900.plist
plutil -lint /實際路徑/com.example.ithome-public-watchdog-2230.plist
```

安裝排程、啟用 Hermes、傳送測試通知與正式發布都需要分開授權與驗收。範例檔存在不代表任何排程已啟用。

## 狀態與停止條件

- publisher event 與 `.publish-click-day-NN.receipt` 是不可覆寫的歷史證據。
- `public-watchdog-state.json` 由單一 watcher 帳號寫入，不能放在 repo 或共享 event 資料夾。
- `lastVerified` 必須同時符合 Day 與日期，才能結束當日檢查。
- 當日已確認公開後，後續 heartbeat 不再讀 RSS、文章頁、Chrome 或舊的 uncertain event。
- 下一個排程 Day 才重新開始。
- 螢幕鎖定不影響背景 HTTPS；Mac 睡眠可能讓排程延後到喚醒後執行。

完整安全與事件契約請參考 Publisher Skill 的 `references/automation-topology.md`、`event-contract.md`、`unattended-runner.md` 與 `hermes-watcher.md`。
