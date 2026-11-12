# フィードバック中継（Cloudflare Workers + D1）

ゲーム内の「ご意見を送る」から届いた投稿を D1 に溜め、**毎日 0:00（日本時間）に前の日の分をまとめます**。
まとめは種類（不具合・要望・感想）ごとに、同じ内容（空白や記号の違いは無視）をまとめて件数の多い順に並べたものです。
**GitHub には何も書きません。** まとめは合言葉付きの管理ページ `https://<中継>/admin` で見ます。

## 一度だけの設定

Cloudflare（無料プラン）にログインし、このフォルダで次を実行します。

```sh
cd feedback-worker
npx wrangler login
npx wrangler d1 create ike-feedback          # 表示された database_id を wrangler.toml に書く
npx wrangler d1 execute ike-feedback --remote --file=schema.sql
npx wrangler secret put ADMIN_KEY            # 管理ページの合言葉（長めのランダムな文字列）
npx wrangler deploy                          # https://ike-feedback.<あなた>.workers.dev が表示される
```

そのあと GitHub リポジトリの Settings → Secrets and variables → Actions → **Variables** に
`FEEDBACK_ENDPOINT` = 表示された URL を追加し、Pages のデプロイをやり直します（Actions → GitHub Pages へデプロイ → Run workflow）。
`FEEDBACK_ENDPOINT` が無いビルドでは、ゲームに「ご意見を送る」は出ません。

## 管理ページと API

- `/admin` … 合言葉を入れると、日ごとのまとめと「今日（集計中）」を見られる
- `GET /api/digests` … まとめの一覧（`Authorization: Bearer <ADMIN_KEY>`）
- `GET /api/digests/2026-11-12` … ある日のまとめ（JSON）
- `GET /api/today` … 今日の分をその場でまとめたもの
- `POST /api/digest?day=2026-11-12` … ある日をまとめ直す

## 守り

- `ALLOWED_ORIGINS` 以外のページからの投稿は断る
- 見えない入力欄が埋まっていたら（ボット）捨てる
- 同じ IP から 10 分に 5 件まで
- 元の投稿は 30 日で消す（まとめは残る）
- 管理ページは投稿の文を HTML として解釈しない
