# iThome publisher 設定

若要比較 publisher、背景公開驗證、Hermes、Codex heartbeat 與 Computer Use 的完整組合，先看[發布與監控自動化](automation.md)。

publisher 是選配的本機發布流程。它讀取 repo payload，連接已登入 iThome 的專用 Chrome，核對唯一草稿後最多點擊一次發布。這與 GitHub Pages 部署是不同階段。

## 架構與分工

- Codex Computer Use：有人操作時稽核、建立或修復草稿；最終公開操作需要當下授權，不能當作 09:30 排程。
- 獨立 Playwright publisher：正式安裝並驗收後，可負責每日 09:30 本機發布。
- Hermes：只讀結果、檢查公開系列並在異常時通知，不負責發布。

## 1．建立專用 Chrome

profile 必須放在 repo 外，並由人手動登入正確帳號。macOS 範例：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9223 \
  --user-data-dir="/你自己的/repo外路徑/ithome-publisher-chrome" \
  https://ithelp.ithome.com.tw/
```

CDP 只能使用 `127.0.0.1`、`localhost` 或 `::1`，不可綁到 LAN／公開網路。不要把 profile、cookie、session、密碼或驗證碼交給 repo 或 Agent。

## 2．準備唯一草稿

publisher 只核對並發布既有草稿，不會在 09:30 臨時建立。每個 Day 必須先有一篇唯一草稿，標題、系列、contest tag、同步連結與正文都要和新鮮產生的 repo payload 一致。

草稿可由人手動建立，或在另外明確授權後，交給支援 Computer Use 的 Agent 使用 `$ithome-ironman-publisher` 執行 `import-drafts --day N`。不得刪除或覆寫衝突草稿；尚未驗證多篇未來草稿的安全性前，不要使用 `--all`。

## 3．設定本機環境

以下值只放在本機執行環境，不提交：

```bash
export ITHOME_CDP_ENDPOINT="http://127.0.0.1:9223"
export ITHOME_DRAFTS_URL="https://ithelp.ithome.com.tw/你的草稿列表"
export ITHOME_PUBLIC_ARTICLES_URL="https://ithelp.ithome.com.tw/你的公開文章列表"
export ITHOME_EVENT_DIR="/repo外的絕對路徑/events"
export ITHOME_BOOTSTRAP_STATE="/repo外的絕對路徑/state/series-bootstrap.json"
```

帳號、系列名稱與 contest tag 由 `ithome.config.json` 讀取。

## 4．真實發布與 Day 1 bootstrap

```bash
pnpm ithome:publish-local -- --day 1
```

這會操作真實網站，只有在使用者另外明確授權後才能執行。Day 必須是 1～30；每次 run 最多點一次發布，結果不明就停止且不得自動重試。

Day 1 發布後，還要從公開文章驗證系列連結，才能建立 verified bootstrap state。Day 2～30 缺少有效 state 時會 fail closed，不會猜 series ID。

## 5．安裝 09:30 排程

可審查的 macOS 範例位於：

- `.agents/skills/ithome-ironman-publisher/examples/macos/run-publisher.zsh`
- `.agents/skills/ithome-ironman-publisher/examples/macos/com.example.ithome-ironman-publisher.plist`

它們不會自動修改作業系統。複製到 repo 外、替換所有 `__...__` placeholder，使用 `plutil -lint` 與 `zsh -n` 驗證，再明確授權安裝。Linux 可依相同 wrapper contract 建立 systemd timer。

排程必須：

- 使用 Asia／Taipei 每日 09:30。
- 依 `ithome.config.json` 日期表決定 Day。
- 在持有專用 Chrome profile 的同一個本機使用者環境執行。
- 同日不得平行執行或自動重試 publish click。
- 缺文章、缺唯一草稿、登入失效或結果不明時停止並留下 machine-readable event。

先完成不點擊發布的 preflight，再安裝排程。完成後應回報排程檔位置、執行使用者、時區、下一次執行時間與 dry-run／mock 結果。Day 1 真實發布仍需在開賽後獨立驗收。

## Fail closed 規則

- payload 只能由 `pnpm ithome:prepare -- --day N --json` 新鮮產生。
- 不刪草稿、不覆寫衝突草稿、不修改已公開文章。
- 發布前核對帳號、系列、contest tag、唯一草稿、標題、同步連結與正文。
- 獨立排程遇到 Cloudflare、CAPTCHA、429、登入失效或暫時性連線問題時，只在尚未點擊發文的前提下最多嘗試三次，每次相隔 5 分鐘；最後仍失敗才留下通知事件。
- 重複草稿、頁面改版或資料不符時立即停止。發文點擊後不可再次點擊；公開文章與草稿狀態可唯讀查證最多三次，每次相隔 5 分鐘。

完整契約請閱讀 `.agents/skills/ithome-ironman-publisher/SKILL.md` 與其 `references/`。需要異常通知時，再看 [Hermes 指南](hermes.md)。
