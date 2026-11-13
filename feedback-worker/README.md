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
npx wrangler deploy                          # ゲームもビルドされ、https://ike.<あなた>.workers.dev が表示される
```

ゲームは同じ Worker から配信され、「ご意見を送る」は同じ URL の `/feedback` に送ります（送り先の設定は不要）。

### 自動デプロイ（ゲームと中継をまとめて）

この Worker（`ike`、https://ike.satoren.workers.dev）はゲーム本体も配信します（`wrangler.toml` の `[assets]` が `../dist`）。
Cloudflare の **Workers Builds**（GitHub 連携）で、main に push するとゲームをビルドしてデプロイします。GitHub に Cloudflare の鍵は置きません。
設定は Cloudflare のダッシュボードで一度だけ（Workers & Pages → ike → Settings → Builds → Connect で satoren/ike を選ぶ）:

- Root directory: `feedback-worker`
- Build command: 空欄（ゲームのビルドは `wrangler.toml` の `[build]` でデプロイ前に必ず走る）
- Deploy command: `npx wrangler deploy`
- ブランチ: `main`（ほかのブランチ・PR はプレビュー版がアップロードされる）

`wrangler.toml` の `database_id` は本番の D1 の id をコミットしてあります。合言葉 `ADMIN_KEY` は Cloudflare 側の secret がそのまま使われます。
手元からデプロイするときも `feedback-worker` で `npx wrangler deploy`（ゲームのビルドも一緒に走る）。

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
