# フィードバック中継（Cloudflare Workers + D1）

ゲーム内の「ご意見を送る」から届いた投稿を D1 に溜め、**毎日 0:00（日本時間）に前の日の分をまとめます**。
まとめは種類（不具合・要望・感想）ごとに、投稿を 1 件ずつ届いた順に並べたものです（同じ文面でも束ねません）。
**GitHub には何も書きません。** まとめと改善リストは合言葉付きの管理ページ `https://<中継>/admin` で見ます。

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

### 自動デプロイ（2 回目から）

Cloudflare の **Workers Builds**（GitHub 連携）で、main に `feedback-worker/` の変更が入ると Cloudflare が自動でデプロイします。
GitHub に Cloudflare の鍵を置く必要はありません。設定は Cloudflare のダッシュボードで一度だけ:

1. Workers & Pages → ike-feedback → Settings → Builds → Connect で satoren/ike を選ぶ
2. Root directory: `feedback-worker`、Deploy command: `npx wrangler deploy`、ブランチ: `main`
3. Build watch paths: `feedback-worker/*`（ゲームだけの変更では動かない）

`wrangler.toml` の `database_id` は本番の D1 の id をコミットしてあります。合言葉 `ADMIN_KEY` は Cloudflare 側の secret がそのまま使われます。

## 管理ページと API

- `/admin` … 合言葉を入れると、日ごとのまとめと「今日（集計中）」を見られる
- `GET /api/digests` … まとめの一覧（`Authorization: Bearer <ADMIN_KEY>`）
- `GET /api/digests/2026-11-12` … ある日のまとめ（JSON）
- `GET /api/today` … 今日の分をその場でまとめたもの
- `POST /api/digest?day=2026-11-12` … ある日をまとめ直す

### 改善リスト（日をまたいで持ち越す）

1 日で対応しきれなかったものは、改善リストの項目として残ります。毎日のルーチンがその日のまとめを読み、
似た投稿を既存の項目に寄せて件数を足すか、新しい項目を作ります。未対応のうち件数の多いものから順に PR にします。

- 状態：未対応（open）・対応中（doing）・済（done）・見送り（wontfix）。管理ページの「改善リスト」タブで変えられる
- 済・見送りの項目に、後の日付で同じ話がまた来たら未対応に戻る
- `GET /api/backlog[?status=open]` … 一覧（対応中→未対応→その他、件数の多い順）
- `POST /api/backlog` … 新しい項目 `{ title, kind, day, count, samples[], note }`
- `PATCH /api/backlog/:id` … 足す・変える `{ add_count, day, samples[], status, pr, note, title }`

## 守り

- `ALLOWED_ORIGINS` 以外のページからの投稿は断る
- 見えない入力欄が埋まっていたら（ボット）捨てる
- 同じ IP から 10 分に 5 件まで
- 元の投稿は 30 日で消す（まとめは残る）
- 管理ページは投稿の文を HTML として解釈しない
