# Hermes 提醒與監控

若要比較 Hermes、Codex heartbeat、Computer Use、Playwright 與背景 watchdog 的完整組合，先看[發布與監控自動化](automation.md)。

Hermes 是選配的唯讀提醒與公開頁面監控，不是自動發文工具。它不登入 iThome、不讀草稿正文，也不按發布；iThome 登入資料留在 publisher 的專用 Chrome，Telegram 連線資料留在 Hermes。

## 預期行為

比賽期間每日執行：

- 09:00：提醒今天應發布的 Day 與日期。
- 19:00：第一次檢查公開系列頁。
- 22:30：再次檢查公開系列頁。

晚間檢查會核對最後一篇文章的標題、日期、網址與個人連載網站連結。全部正確時保持安靜；內容不符才通知。公開頁暫時不可讀時最多重試 2 次，每次間隔 2 分鐘；仍失敗才通知人工檢查，不能誤報為尚未發布。非三十天比賽日期時保持安靜。

這項公開驗證是背景 HTTPS／RSS 檢查，不依賴 Chrome、Computer Use 或登入 Cookie。macOS 只鎖定螢幕時仍可執行；如果整台 Mac 進入睡眠，排程可能延後到喚醒後才執行。

## 開始前準備

先確認四個實際位置，不可猜測：

1. repo 的絕對路徑。
2. publisher event 資料夾。
3. Day 1 驗證後的 `series-bootstrap.json`。
4. Hermes 私有狀態資料夾。

Hermes 只能讀 publisher event 與 bootstrap state；`watcher-state.json`、`public-watchdog-state.json` 要放在 Hermes 自己的私有資料夾，不能放進共享資料夾或 repo。

## 第一步：只做 preflight

把下面內容交給目前接收通知的 Hermes：

```text
請檢查 iThome 發文提醒是否可啟用，先不要建立排程或傳送真實通知。

專案資料夾：<絕對路徑>
發布結果資料夾：<絕對路徑>
系列資料檔：<series-bootstrap.json 絕對路徑>

請閱讀 docs/hermes.md 與 .agents/skills/ithome-ironman-publisher/references/hermes-watcher.md，確認 watchdog 與 notify 程式存在。你只能讀取發布結果與系列資料，不可改寫或刪除。

請在自己的私有資料夾規劃 watcher-state.json 與 public-watchdog-state.json，使用測試資料 dry-run，分別驗證：正確時安靜、內容不符時提醒、頁面讀取失敗時產生檢查失敗通知。

不要登入 iThome、操作草稿、發布文章、建立第二個 Telegram 接收程式或寫入正式狀態。完成後回報路徑、權限、三種 dry-run 結果、私人狀態檔位置、缺漏，以及是否適合建立排程。
```

只有 preflight 明確通過後，才能進入下一步。

## 第二步：建立正式排程

```text
我已確認 iThome 發文提醒 preflight 通過。請使用上次已確認的路徑建立 Asia/Taipei 排程，不要猜測路徑或沿用其他測試系列。

建立三個每日任務：
1. 09:00 reminder 模式。
2. 19:00 check 模式，檢查代號 public-1900。
3. 22:30 check 模式，檢查代號 public-2230。

必須依 ithome.config.json 的 30 天日期表決定 Day；非比賽日保持安靜。晚間檢查使用 Day 1 已驗證的正式系列網址，核對唯一完整標題、文章網址、日期與個人連載網站連結。正常時保持安靜；內容不符時提醒；頁面讀取失敗最多重試 2 次、每次間隔 2 分鐘，仍失敗才通知人工檢查。

通知沿用既有 Telegram Gateway 並使用 --no-agent，不建立第二個接收程式。本次只授權唯讀檢查、排程與通知，不授權登入 iThome、操作草稿或發布文章。

建立後先做不傳送真實通知的驗收，回報三個 job ID、時間與時區、執行帳號、repo 版本、私人狀態檔位置、下一次執行時間、驗收結果，以及 Telegram Gateway 與 --no-agent 狀態。
```

## 不使用 Hermes 的 macOS 背景排程

只需要鎖定螢幕時仍能執行公開驗證，不需要 Telegram 時，可以直接使用 repo 內的可審查範例：

- `.agents/skills/ithome-ironman-publisher/examples/macos/run-public-watchdog.zsh`
- `.agents/skills/ithome-ironman-publisher/examples/macos/com.example.ithome-public-watchdog-1900.plist`
- `.agents/skills/ithome-ironman-publisher/examples/macos/com.example.ithome-public-watchdog-2230.plist`

安裝前請先：

1. 把 wrapper 與兩份 plist 複製到 repo 外。
2. 替換所有 `__...__` placeholder；不要把個人絕對路徑寫回 Git。
3. 將 `public-watchdog-state.json` 放在執行帳號自己的私有資料夾，不可放在 repo 或共享 event 資料夾。
4. 執行 `zsh -n <wrapper>` 與 `plutil -lint <plist>`。
5. 使用 `--dry-run` 的正式命令驗證正確文章安靜、內容不符與讀取失敗能分開回報，再另外明確授權安裝 LaunchAgent。

兩份 plist 分別傳入 `public-1900` 與 `public-2230`，避免用執行時間猜 checkpoint。它們使用 Mac 本地時區；採用範例時間前，先確認主機時區是 `Asia/Taipei`。背景 wrapper 不登入 iThome、不操作草稿、不讀 Chrome profile，也不會傳 Telegram；異常文字只寫到設定的 log。若要推播，另接既有通知 relay，不要建立第二個 Telegram poller。

## 完成標準

- 取得三個任務各自的 job ID。
- 時區為 `Asia/Taipei`，時間為 09:00、19:00、22:30。
- 兩個私人狀態檔不在 repo 或 publisher 共享資料夾。
- 測試能區分「內容不符」與「頁面讀取失敗」。
- 正常結果不傳 Telegram。
- Hermes 沒有取得 iThome cookie、Chrome profile 或登入資料。
- 鎖定螢幕時公開驗證仍可執行；睡眠狀態則另行驗收喚醒後行為。

這些排程不包含每日 09:30 發布；自動發布必須在 [publisher 環境](publisher.md) 另外安裝與驗收。
