# 部署 GitHub Pages

先完成 [README](../README.md) 與 [設定指南](setup.md) 的本機驗證，再啟用 GitHub Pages。

## 啟用步驟

1. 把確認過的變更推到 GitHub 的 `main` 分支。
2. 到 repo 的 **Settings → Pages**。
3. 在 **Build and deployment** 選擇 **GitHub Actions**。
4. 手動執行一次 `Deploy to GitHub Pages` workflow。
5. 實際開啟首頁與一篇文章，確認網址、內容、圖片與連結正常。

workflow 也會每天在 Asia／Taipei 00:15 建置，讓當日文章、RSS 與 Sitemap 一起更新。

## 網址規則

`ithome.config.json` 會產生 Pages 的 `site`、`base` 與 `publicUrl`：

- 使用者首頁 repo（名稱為 `帳號.github.io`）使用空的 base。
- 一般 project Pages 使用 `/<repo 名稱>`。
- 主系列網址維持 `/day/01/`～`/day/30/`。

修改顏色、字型、首頁或文章版型時，可以調整 `src/layouts/`、`src/pages/` 與樣式檔，但應保留上述網址規則。修改後重新執行：

```bash
pnpm test:ithome
pnpm check
pnpm build
pnpm verify:public
```

## 驗收邊界

本機測試成功不等於部署成功；GitHub Actions 顯示成功也不等於公開頁面正確。完成部署至少要分別確認：

- 本機測試與建置成功。
- GitHub Actions workflow 成功。
- 實際公開網址與 `ithome.config.json` 一致。
- 首頁、Day 文章、RSS、Sitemap 與品牌圖片可讀。

GitHub Pages 不需要也不應取得 iThome cookie、Chrome profile 或登入 session。若只需要個人網站，到這裡即可；需要 iThome 自動發布時再看 [publisher 指南](publisher.md)。
